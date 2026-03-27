import { loadConfig } from './config.js';
import type { AgentEffortLevel, AgentProvider } from './provider.js';
import { getReadyIssues, getIssueDetails, getPrimeContext, listAllIssues, enableMockMode } from './beads.js';
import { checkoutDefault, pullDefault, countNewCommits, getCommitCountAhead, getCurrentBranch, deleteBranch } from './git.js';
import { assemblePrompt } from './prompt.js';
import { spawnAgent } from './agent.js';
import { createOctokit, findPR, pollForMerge } from './github.js';
import { setVerbose, log } from './verbose.js';
import { brand, success, waiting, error, dim } from './display/terminal.js';
import { execSync } from 'child_process';
import { getProviderDescriptor } from './provider.js';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
import type { QuetzBus } from './events.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoopResult {
  exitCode: number;
  reason: 'victory' | 'no_issues' | 'error';
}

// ── Elapsed timer ────────────────────────────────────────────────────────────

function startElapsedTimer(
  phase: 'agent' | 'polling' | 'commit',
  issueIdStr: string,
  iteration: number,
  total: number,
  prNumber?: number
): { stop: () => void } {
  const startTime = Date.now();
  let lastLen = 0;
  const interval = setInterval(() => {
    const elapsed = formatElapsed(Date.now() - startTime);
    const prLabel = prNumber ? `PR #${prNumber} — ` : '';
    const phaseText = phase === 'agent' ? 'Agent running...' : `${prLabel}waiting for merge`;
    const line = `[quetz] Issue ${iteration}/${total} | ${issueIdStr} | ${phaseText} (${elapsed})`;
    const clearLen = Math.max(lastLen, line.length);
    process.stdout.write(`\r${' '.repeat(clearLen)}\r${line}`);
    lastLen = line.length;
  }, 1000);
  return { stop: () => { clearInterval(interval); if (lastLen > 0) process.stdout.write(`\r${' '.repeat(lastLen)}\r`); } };
}

// ── Status command ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getStatusDisplay(
  ready: number,
  inProgress: number,
  completed: number,
  total: number,
  nextIssue: { id: string; title: string; priority: number } | undefined,
  config: any
): string {
  const nextLabel = nextIssue
    ? `${brand(nextIssue.id)} "${nextIssue.title}" ${dim(`[P${nextIssue.priority}]`)}`
    : dim('none');

  return (
    brand('Quetz Status') + '\n' +
    '════════════\n' +
    dim(new Date().toLocaleTimeString()) + '\n\n' +
    (total > 0
      ? `Issues: ${success(String(ready))} ready / ${waiting(String(inProgress))} in progress / ${dim(String(completed))} completed / ${dim(String(total))} total\n`
      : `Issues: ${success(String(ready))} ready\n`) +
    `Next:   ${nextLabel}\n` +
    `Config: ${dim(`${config.github.owner}/${config.github.repo} (${config.github.defaultBranch})`)}\n`
  );
}

export async function showStatus(): Promise<void> {
  const config = loadConfig();

  let readyIssues: { id: string; title: string; priority: number }[] = [];
  try {
    readyIssues = getReadyIssues();
  } catch {
    process.stderr.write(error('Failed to query bd ready.\n'));
    process.exit(1);
  }
  const allIssues = listAllIssues();
  const total = allIssues.length;
  const inProgress = allIssues.filter(i => i.status === 'in_progress').length;
  const completed = allIssues.filter(i => i.status === 'closed' || i.status === 'done').length;
  const ready = readyIssues.length;
  const nextIssue = readyIssues[0];

  process.stdout.write('\n' + getStatusDisplay(ready, inProgress, completed, total, nextIssue, config));
}

// ── Run loop ─────────────────────────────────────────────────────────────────

export async function runLoop(
  opts: {
    provider?: AgentProvider;
    model?: string;
    effort?: AgentEffortLevel;
    timeout?: number;
    localCommits?: boolean;
    amend?: boolean;
    simulate?: boolean;
  },
  bus?: QuetzBus
): Promise<LoopResult> {
  // Only enable verbose in non-TUI mode. In TUI mode (bus present), stderr
  // writes from log() corrupt Ink's cursor-position tracking, causing the
  // previous render frame to remain visible as a ghost header.
  if (!bus) {
    setVerbose(true);
    log('QUETZ', 'Verbose mode enabled');
  }
  const simulate = opts.simulate ?? false;
  if (simulate) enableMockMode();

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);
  log('CONFIG', `Loaded: ${config.github.owner}/${config.github.repo} (${config.github.defaultBranch})`);

  // ── Normal run loop ───────────────────────────────────────────────────────
  const localCommits = opts.localCommits ?? false;
  const amend = opts.amend ?? false;
  const localMode = localCommits || amend; // no GitHub API needed
  const octokit = (localMode || simulate) ? null : createOctokit();
  const runMode: 'pr' | 'commit' | 'amend' = amend ? 'amend' : (localCommits ? 'commit' : 'pr');
  const simulateLaunchBranch = simulate ? getCurrentBranch(projectRoot) : '';
  if (bus) bus.emit('loop:mode', { mode: runMode });
  let iteration = 0;
  const loopStart = Date.now();
  let totalIssuesCompleted = 0;
  let totalPrsMerged = 0;
  let totalCommitsLanded = 0;
  let isFirstIssue = true; // tracks first vs. subsequent issues in amend mode
  // In simulate mode, track which mock issues have been "consumed" so the loop
  // advances through the list instead of re-fetching the same first issue.
  const simulateCompleted = new Set<string>();
  let loopStartEmitted = false;

  while (true) {
    iteration++;

    // 1. Get next ready issue
    let issues: ReturnType<typeof getReadyIssues>;
    try {
      issues = getReadyIssues();
    } catch (err) {
      if (bus) bus.emit('loop:failure', { reason: `bd ready failed: ${(err as Error).message}` });
      else process.stderr.write(error(`\nbd ready failed: ${(err as Error).message}\n`));
      return { exitCode: 1, reason: 'error' };
    }

    // In simulate mode, filter out already-completed issues
    if (simulate) {
      issues = issues.filter(i => !simulateCompleted.has(i.id));
    }

    // Emit loop:start on first successful fetch so UI can show total count
    if (!loopStartEmitted && bus && issues.length > 0) {
      bus.emit('loop:start', { total: issues.length });
      loopStartEmitted = true;
    }

    if (issues.length === 0) {
      if (iteration === 1) {
        if (bus) bus.emit('loop:warning', { message: 'No ready issues found. The serpent sleeps.' });
        else process.stdout.write(waiting('\nNo ready issues found. The serpent sleeps.\n'));
        return { exitCode: 0, reason: 'no_issues' };
      } else {
        let finalCommitHash: string | undefined;
        let finalCommitMsg: string | undefined;
        if (amend && !simulate) {
          try {
            const gitLog = execSync(`git log -1 --format=%H %s`, { encoding: 'utf-8', cwd: projectRoot }).trim();
            const spaceIdx = gitLog.indexOf(' ');
            finalCommitHash = spaceIdx > -1 ? gitLog.slice(0, spaceIdx) : gitLog;
            finalCommitMsg = spaceIdx > -1 ? gitLog.slice(spaceIdx + 1) : '';
          } catch {
            // not critical
          }
        }
        const victoryPayload = {
          issuesCompleted: totalIssuesCompleted,
          totalTime: formatElapsed(Date.now() - loopStart),
          prsMerged: totalPrsMerged,
          mode: runMode,
          commitsLanded: totalCommitsLanded,
          commitHash: finalCommitHash,
          commitMsg: finalCommitMsg,
        };
        if (bus) {
          bus.emit('loop:victory', victoryPayload);
        } else {
          // Inline victory display for non-bus fallback
          const stats = victoryPayload;
          const isLocalCommitsMode = stats.mode === 'commit';
          const isAmend = stats.mode === 'amend';
          const statLabel = isAmend ? 'Commit ready  ' : (isLocalCommitsMode ? 'Commits landed' : 'PRs merged    ');
          const statValue = isAmend
            ? (stats.commitHash ? stats.commitHash.slice(0, 7) : '1')
            : (isLocalCommitsMode ? String(stats.commitsLanded ?? stats.issuesCompleted) : String(stats.prsMerged));

          process.stdout.write(
            `\n${success('✓ All issues resolved. The serpent rests.')}\n` +
            `${brand('~~~ QUETZ VICTORY ~~~')}\n\n` +
            `   ${brand('╔══════════════════════════════════════╗')}\n` +
            `   ${brand('║')}                                      ${brand('║')}\n` +
            `   ${brand('║')}    ${success('COMPLETED')}                        ${brand('║')}\n` +
            `   ${brand('║')}                                      ${brand('║')}\n` +
            `   ${brand('║')}    Issues: ${String(stats.issuesCompleted).padEnd(26)} ${brand('║')}\n` +
            `   ${brand('║')}    Time: ${stats.totalTime.padEnd(29)} ${brand('║')}\n` +
            `   ${brand('║')}    ${statLabel}: ${statValue.padEnd(21)} ${brand('║')}\n` +
            `   ${brand('║')}                                      ${brand('║')}\n` +
            `   ${brand('║')}    ${dim('The serpent rests. 🐉')}              ${brand('║')}\n` +
            `   ${brand('║')}                                      ${brand('║')}\n` +
            `   ${brand('╚══════════════════════════════════════╝')}\n\n` +
            (isAmend ? `${success('All issues complete. 1 commit ready to push.')}\n${dim(stats.commitHash ?? '')} ${dim(stats.commitMsg ?? '')}\n\n` : '')
          );
        }
        return { exitCode: 0, reason: 'victory' };
      }
    }

    const issue = issues[0];
    const issueTotal = issues.length + totalIssuesCompleted;

    // 2. Get full issue details
    let issueDetails = issue;
    try {
      issueDetails = getIssueDetails(issue.id);
    } catch {
      // fall back to ready data
    }

    if (bus) {
      bus.emit('loop:issue_pickup', { id: issue.id, title: issue.title, priority: issue.priority, type: issue.issue_type, iteration, total: issueTotal });
    } else {
      process.stdout.write(
        `\n${brand('🐉 Picking up')} ${issue.id}: "${issue.title}" ${dim(`[P${issue.priority} ${issue.issue_type}]`)}\n` +
        `   ${dim('──── Summoning agent ────')}\n\n`
      );
    }

    // 3. Git reset to default branch (skip in amend mode and simulate mode)
    if (!amend && !simulate) {
      if (bus) bus.emit('loop:phase', { phase: 'git_reset', detail: `git checkout ${config.github.defaultBranch} && git pull` });
      else process.stdout.write(dim(`  git checkout ${config.github.defaultBranch} && git pull…\n`));
      try {
        checkoutDefault(config.github.defaultBranch, projectRoot);
        pullDefault(config.github.defaultBranch, projectRoot);
      } catch (err) {
        if (bus) bus.emit('loop:failure', { reason: `Git error: ${(err as Error).message}` });
        else process.stderr.write(error(`\nGit error: ${(err as Error).message}\n`));
        return { exitCode: 1, reason: 'error' };
      }
    }

    // 4. Assemble prompt
    const bdPrime = simulate ? '' : getPrimeContext();
    const prompt = assemblePrompt(issueDetails, bdPrime, config, localCommits, amend, isFirstIssue, simulate);

    // 5. Spawn agent
    const agentStart = Date.now();
    const agentTimeout = opts.timeout ?? config.agent.timeout;
    const agentProvider = opts.provider ?? config.agent.provider ?? 'claude';
    const providerConfig =
      config.agent.providers?.[agentProvider] ??
      {};
    const agentModel =
      opts.model ??
      providerConfig.model ??
      config.agent.model ??
      getProviderDescriptor(agentProvider).defaultModel;
    const agentEffort =
      opts.effort ??
      providerConfig.effort ??
      config.agent.effort ??
      'medium';
    if (bus) {
      bus.emit('loop:phase', {
        phase: 'agent_running',
        detail: agentModel,
        agentProvider,
        agentModel,
        agentEffort,
      });
    }
    else process.stdout.write(dim('\n  Starting agent…\n'));
    log(
      'AGENT',
      `provider=${agentProvider}, model=${agentModel}, timeout=${agentTimeout}m${agentEffort ? `, effort=${agentEffort}` : ''}`
    );

    let exitCode: number;
    try {
      exitCode = await spawnAgent(
        prompt,
        projectRoot,
        agentTimeout,
        agentModel,
        bus,
        agentEffort,
        simulate,
        agentProvider,
        providerConfig
      );
    } catch (err) {
      if (bus) bus.emit('loop:failure', { reason: `Agent error: ${(err as Error).message}` });
      else process.stderr.write(error(`\nAgent error: ${(err as Error).message}\n`));
      return { exitCode: 1, reason: 'error' };
    }

    if (exitCode !== 0) {
      if (bus) bus.emit('loop:failure', { reason: `Agent exited with code ${exitCode}` });
      else process.stderr.write(error(`\nAgent exited with code ${exitCode}. The serpent retreats.\n`));
      return { exitCode: 1, reason: 'error' };
    }

    if (simulate) {
      // ── Simulate path: fake the post-agent lifecycle ─────────────────────

      if (amend) {
        // ── Simulate amend path ──────────────────────────────────────────────
        await sleep(1500);
        if (bus) bus.emit('loop:amend_complete', { issueId: issue.id, iteration: totalIssuesCompleted + 1 });
        else process.stdout.write(
          `\n${success(`✓ Amend simulated`)} ${brand(`The serpent folds ${issue.id} into the commit.`)}\n\n`
        );
        isFirstIssue = false;
        totalIssuesCompleted++;
        simulateCompleted.add(issue.id);
        await sleep(1000);

      } else if (localCommits) {
        // ── Simulate commit-only path ────────────────────────────────────────
        await sleep(1500);
        if (bus) bus.emit('loop:commit_landed', { issueId: issue.id });
        else process.stdout.write(
          `\n${success('✓ Commit simulated')} ${brand(`The serpent devours ${issue.id}.`)}\n\n`
        );
        totalCommitsLanded++;
        totalIssuesCompleted++;
        simulateCompleted.add(issue.id);
        await sleep(1000);

      } else {
        // ── Simulate PR path (default) ───────────────────────────────────────
        const fakePrNum = 100 + iteration;
        const fakePrTitle = `feat: ${issueDetails.title.toLowerCase()} (${issue.id})`;
        const fakePrUrl = `https://github.com/${config.github.owner}/${config.github.repo}/pull/${fakePrNum}`;

        // Simulate PR detection delay
        await sleep(1500);
        if (bus) bus.emit('loop:pr_found', { number: fakePrNum, title: fakePrTitle, url: fakePrUrl });
        else process.stdout.write(
          `${success(`✓  Found PR #${fakePrNum}`)}: "${fakePrTitle}"\n` +
          `   ${dim(fakePrUrl)}\n` +
          `   ${waiting('Watching for merge…')}\n`
        );

        // Simulate merge poll delay
        if (bus) bus.emit('loop:phase', { phase: 'pr_polling' });
        const pollTimer = !bus ? startElapsedTimer('polling', issue.id, iteration, issueTotal, fakePrNum) : null;
        await sleep(3000);
        pollTimer?.stop();

        // Celebrate
        totalIssuesCompleted++;
        totalPrsMerged++;
        simulateCompleted.add(issue.id);
        const remaining = issues.length - 1;

        if (bus) bus.emit('loop:merged', { prNumber: fakePrNum, issueId: issue.id, remaining });
        else process.stdout.write(
          `\n${success(`✅ PR #${fakePrNum} merged!`)} ${brand(`The serpent devours ${issue.id}.`)}\n` +
          `   ${dim('─'.repeat(40))}\n` +
          `   Issues remaining: ${remaining}\n` +
          `   ${dim('─'.repeat(40))}\n\n`
        );
        await sleep(2000);

        // Cleanup: return to default branch and delete agent's temp branch
        const agentBranch = getCurrentBranch(projectRoot);
        if (
          agentBranch &&
          agentBranch !== config.github.defaultBranch &&
          agentBranch !== simulateLaunchBranch
        ) {
          try {
            checkoutDefault(config.github.defaultBranch, projectRoot);
            deleteBranch(agentBranch, projectRoot);
            log('SIMULATE', `Cleaned up branch: ${agentBranch}`);
          } catch {
            log('SIMULATE', `Warning: could not clean up branch ${agentBranch}`);
          }
        }
      }

    } else if (amend) {
      // ── Amend path: verify commit count, update isFirstIssue, then continue ─
      if (bus) bus.emit('loop:phase', { phase: 'amend_verifying' });
      const commitCount = getCommitCountAhead(config.github.defaultBranch, projectRoot);
      log('GIT', `Commits ahead of ${config.github.defaultBranch}: ${commitCount}`);

      if (commitCount === 0) {
        if (bus) bus.emit('loop:warning', { message: `No commit found for ${issue.id}. Next issue will create a fresh commit.` });
        else process.stdout.write(waiting(`\n  Warning: no commit found for ${issue.id}. Next issue will create a fresh commit.\n`));
        // isFirstIssue stays true so next iteration creates a new commit
      } else if (commitCount === 1) {
        if (bus) bus.emit('loop:amend_complete', { issueId: issue.id, iteration: totalIssuesCompleted + 1 });
        else process.stdout.write(
          `\n${success(`✓ Amend ${totalIssuesCompleted + 1} complete`)} ${brand(`The serpent folds ${issue.id} into the commit.`)}\n\n`
        );
        isFirstIssue = false;
      } else {
        // Agent created multiple commits — warn but proceed
        if (bus) bus.emit('loop:warning', { message: `${commitCount} commits found for ${issue.id} (expected 1). Amend semantics may not have been followed.` });
        else process.stdout.write(waiting(`\n  Warning: ${commitCount} commits found for ${issue.id} (expected 1). Amend semantics may not have been followed.\n`));
        isFirstIssue = false;
      }

      totalIssuesCompleted++;
      await sleep(1000);

    } else if (localCommits) {
      // ── Local-commits path: verify a commit landed, then continue ──────────
      if (bus) bus.emit('loop:phase', { phase: 'commit_verifying' });
      const newCommits = countNewCommits(config.github.defaultBranch, projectRoot);
      log('GIT', `New commits since ${config.github.defaultBranch}: ${newCommits}`);

      if (newCommits === 0) {
        if (bus) bus.emit('loop:warning', { message: `No new commit found for ${issue.id}. Continuing to next issue.` });
        else process.stdout.write(waiting(`\n  Warning: no new commit found for ${issue.id}. Continuing to next issue.\n`));
      } else {
        if (bus) bus.emit('loop:commit_landed', { issueId: issue.id });
        else process.stdout.write(
          `\n${success('✓ Commit landed')} ${brand(`The serpent devours ${issue.id}.`)}\n\n`
        );
        totalCommitsLanded++;
      }

      totalIssuesCompleted++;
      await sleep(1000);

    } else {
      // ── PR path: detect PR and poll for merge ──────────────────────────────
      if (bus) bus.emit('loop:phase', { phase: 'pr_detecting' });
      else process.stdout.write(
        `\n   ${dim('──── Agent session complete ────')}\n` +
        `${waiting('🔍 Searching for PR…')}\n`
      );
      // 6. Detect PR
      log('GITHUB', `Searching for PR referencing ${issue.id}`);
      const spawnTime = new Date(agentStart);
      const pr = await findPR(
        octokit!,
        config.github.owner,
        config.github.repo,
        issue.id,
        spawnTime,
        config.poll.prDetectionTimeout
      );

      if (!pr) {
        log('GITHUB', `PR detection timed out after ${config.poll.prDetectionTimeout}s`);
        if (bus) bus.emit('loop:failure', { reason: `No PR found referencing ${issue.id}` });
        else {
          process.stdout.write(
            `\n${error(`🔍  No PR found referencing ${issue.id}`)}\n` +
            `\n${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
          );
        }
        return { exitCode: 1, reason: 'error' };
      }
      log('GITHUB', `Found PR #${pr.number}: "${pr.title}"`);

      if (bus) bus.emit('loop:pr_found', { number: pr.number, title: pr.title, url: pr.html_url });
      else process.stdout.write(
        `${success(`✓  Found PR #${pr.number}`)}: "${pr.title}"\n` +
        `   ${dim(pr.html_url)}\n` +
        `   ${waiting('Watching for merge…')}\n`
      );

      // 7. Poll for merge
      log('GITHUB', `Polling PR #${pr.number} for merge`);
      if (bus) bus.emit('loop:phase', { phase: 'pr_polling' });
      const pollTimer = !bus ? startElapsedTimer('polling', issue.id, iteration, issueTotal, pr.number) : null;

      const result = await pollForMerge(
        octokit!,
        config.github.owner,
        config.github.repo,
        pr.number,
        config,
        (elapsed) => {
          if (bus) bus.emit('loop:phase', { phase: 'pr_polling', detail: `Waiting… ${elapsed}` });
          else process.stdout.write(dim(`  Waiting… ${elapsed}\r`));
          log('GITHUB', `Still waiting… PR #${pr.number} not yet merged (${elapsed} elapsed)`);
        }
      );

      pollTimer?.stop();

      switch (result.status) {
        case 'merged': {
          log('GITHUB', `PR #${pr.number} merged successfully`);
          totalIssuesCompleted++;
          totalPrsMerged++;
          const remaining = issues.length - 1;
          if (bus) bus.emit('loop:merged', { prNumber: pr.number, issueId: issue.id, remaining });
          else process.stdout.write(
            `\n${success(`✅ PR #${pr.number} merged!`)} ${brand(`The serpent devours ${issue.id}.`)}\n` +
            `   ${dim('─'.repeat(40))}\n` +
            `   Issues remaining: ${remaining}\n` +
            `   ${dim('─'.repeat(40))}\n\n`
          );
          await sleep(2000); // Brief celebration pause before next issue
          break;
        }

        case 'closed':
          if (bus) bus.emit('loop:failure', { reason: 'PR closed without merging', prNumber: pr.number, prUrl: pr.html_url });
          else process.stdout.write(
            `\n${error(`❌  PR #${pr.number} closed without merging`)}\n` +
            `${dim(pr.html_url)}\n` +
            `\n${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
          );
          return { exitCode: 1, reason: 'error' };

        case 'ci_failed':
          if (bus) bus.emit('loop:failure', { reason: 'CI failed', detail: result.details, prNumber: pr.number, prUrl: result.pr.html_url });
          else process.stdout.write(
            `\n${error(`💥  CI failed on PR #${pr.number}`)}\n` +
            (result.details ? `${dim(result.details)}\n` : '') +
            `${dim(result.pr.html_url)}\n` +
            `\n${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
          );
          return { exitCode: 1, reason: 'error' };

        case 'timeout':
          if (bus) bus.emit('loop:failure', { reason: `Merge timeout (${config.poll.mergeTimeout}m) exceeded`, prNumber: pr.number, prUrl: pr.html_url });
          else process.stdout.write(
            `\n${error(`⏰  Merge timeout (${config.poll.mergeTimeout}m) exceeded`)}\n` +
            `PR #${pr.number}\n` +
            `${dim(pr.html_url)}\n` +
            `\n${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
          );
          return { exitCode: 1, reason: 'error' };
      }
    }

    // Loop back to step 1
  }
}
