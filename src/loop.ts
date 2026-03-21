import { loadConfig } from './config.js';
import { getReadyIssues, getIssueDetails, getPrimeContext, listAllIssues, enableMockMode } from './beads.js';
import { checkoutDefault, pullDefault, countNewCommits, getCommitCountAhead } from './git.js';
import { assemblePrompt } from './prompt.js';
import { spawnAgent } from './agent.js';
import { createOctokit, findPR, pollForMerge } from './github.js';
import { setVerbose, log } from './verbose.js';
import {
  printPickup,
  printAgentStarting,
  printAgentComplete,
  printPRFound,
  printMerged,
  printCommitVerified,
  printAmendComplete,
  printFailure,
  printVictory,
  type VictoryStats,
} from './display/messages.js';
import { brand, success, waiting, error, dim } from './display/terminal.js';
import * as tui from './display/tui.js';
import { formatElapsed, updateStatusLine } from './display/status.js';
import { execSync } from 'child_process';

// ── Elapsed timer ────────────────────────────────────────────────────────────

function startElapsedTimer(
  phase: 'agent' | 'polling' | 'commit',
  issueIdStr: string,
  iteration: number,
  total: number,
  prNumber?: number
): { stop: () => void } {
  const startTime = Date.now();
  const interval = setInterval(() => {
    const elapsed = formatElapsed(Date.now() - startTime);
    updateStatusLine({ iteration, total, issueIdStr, phase, elapsed, prNumber });
    if (tui.isActive()) {
      tui.writeHeader({
        issueIdStr,
        issueTitle: '',
        iteration,
        total,
        elapsed,
        phase,
      });
    }
    if (tui.consumeResize()) {
      // Re-render header and footer on terminal resize
      if (tui.isActive()) {
        tui.writeHeader({ issueIdStr, issueTitle: '', iteration, total, elapsed, phase });
        tui.writeFooter({ issueIdStr, phase, elapsed, prNumber });
      }
    }
  }, 1000);
  return { stop: () => clearInterval(interval) };
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

export async function showStatus(watch: boolean = false, mock: boolean = false): Promise<void> {
  if (mock) enableMockMode();
  const config = loadConfig();

  function fetchStatusData() {
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
    return { ready, inProgress, completed, total, nextIssue };
  }

  if (watch) {
    process.stdout.write(brand('\nQuetz Status') + (mock ? dim(' [mock]') : '') + '\n');
    process.stdout.write('Press Ctrl+C to exit\n\n');

    while (true) {
      const data = fetchStatusData();
      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write(getStatusDisplay(data.ready, data.inProgress, data.completed, data.total, data.nextIssue, config));
      await sleep(5000);
    }
  } else {
    const data = fetchStatusData();
    process.stdout.write('\n' + getStatusDisplay(data.ready, data.inProgress, data.completed, data.total, data.nextIssue, config));
  }
}

// ── Run loop ─────────────────────────────────────────────────────────────────

export async function runLoop(opts: { dry: boolean; model?: string; timeout?: number; verbose?: boolean; localCommits?: boolean; amend?: boolean; mock?: boolean; simulate?: boolean }): Promise<void> {
  if (opts.verbose) {
    setVerbose(true);
    log('QUETZ', 'Verbose mode enabled');
  }
  const simulate = opts.simulate ?? false;
  if (opts.mock || simulate) enableMockMode();

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);
  if (opts.verbose) {
    log('CONFIG', `Loaded: ${config.github.owner}/${config.github.repo} (${config.github.defaultBranch})`);
  }

  // ── Dry-run ──────────────────────────────────────────────────────────────
  if (opts.dry) {
    let issues: ReturnType<typeof getReadyIssues>;
    try {
      issues = getReadyIssues();
    } catch (err) {
      process.stderr.write(error(`bd ready failed: ${(err as Error).message}\n`));
      process.exit(1);
    }

    if (issues.length === 0) {
      process.stdout.write(waiting('\nNo ready issues found. The serpent sleeps.\n'));
      process.exit(0);
    }

    process.stdout.write(brand('\nIssue Queue (priority order):\n'));
    process.stdout.write('─'.repeat(50) + '\n');
    for (const [i, issue] of issues.entries()) {
      process.stdout.write(
        `${i + 1}. ` +
        brand(issue.id) +
        ` ${dim(`[P${issue.priority}] [${issue.issue_type}]`)} ${issue.title}\n`
      );
    }
    process.stdout.write('─'.repeat(50) + '\n\n');

    const firstIssue = issues[0];
    let issueDetails = firstIssue;
    try {
      issueDetails = getIssueDetails(firstIssue.id);
    } catch {
      // fall back to ready data
    }
    const bdPrime = getPrimeContext();
    const prompt = assemblePrompt(issueDetails, bdPrime, config, opts.localCommits ?? false, opts.amend ?? false, true);

    process.stdout.write(brand('Prompt for first issue:\n'));
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write(prompt + '\n');
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write(brand('\n--- Dry run complete (no agent spawned) ---\n'));
    process.exit(0);
  }

  // ── Normal run loop ───────────────────────────────────────────────────────
  const localCommits = opts.localCommits ?? false;
  const amend = opts.amend ?? false;
  const localMode = localCommits || amend; // no GitHub API needed
  const octokit = (localMode || simulate) ? null : createOctokit();
  let iteration = 0;
  const loopStart = Date.now();
  let totalIssuesCompleted = 0;
  let totalPrsMerged = 0;
  let totalCommitsLanded = 0;
  let isFirstIssue = true; // tracks first vs. subsequent issues in amend mode
  // In simulate mode, track which mock issues have been "consumed" so the loop
  // advances through the list instead of re-fetching the same first issue.
  const simulateCompleted = new Set<string>();

  while (true) {
    iteration++;

    // 1. Get next ready issue
    let issues: ReturnType<typeof getReadyIssues>;
    try {
      issues = getReadyIssues();
    } catch (err) {
      process.stderr.write(error(`\nbd ready failed: ${(err as Error).message}\n`));
      process.exit(1);
    }

    // In simulate mode, filter out already-completed issues
    if (simulate) {
      issues = issues.filter(i => !simulateCompleted.has(i.id));
    }

    if (issues.length === 0) {
      if (iteration === 1) {
        process.stdout.write(waiting('\nNo ready issues found. The serpent sleeps.\n'));
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
        const stats: VictoryStats = {
          issuesCompleted: totalIssuesCompleted,
          totalTime: formatElapsed(Date.now() - loopStart),
          prsMerged: totalPrsMerged,
          mode: amend ? 'amend' : (localCommits ? 'local-commits' : 'pr'),
          commitsLanded: totalCommitsLanded,
          commitHash: finalCommitHash,
          commitMsg: finalCommitMsg,
        };
        if (tui.isActive()) {
          tui.writeHeader({
            issueIdStr: '',
            issueTitle: '',
            iteration: totalIssuesCompleted,
            total: totalIssuesCompleted,
            elapsed: stats.totalTime,
            phase: 'victory',
          });
          tui.writeFooter({
            issueIdStr: '',
            phase: 'victory',
            elapsed: stats.totalTime,
          });
        }
        printVictory(stats);
      }
      process.exit(0);
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

    // 3. Update TUI header for agent phase
    if (tui.isActive()) {
      tui.writeHeader({
        issueIdStr: issue.id,
        issueTitle: issueDetails.title ?? issue.title,
        iteration,
        total: issueTotal,
        elapsed: '0m 00s',
        phase: 'agent',
      });
      tui.writeFooter({
        issueIdStr: issue.id,
        phase: 'agent',
        elapsed: '0m 00s',
      });
    }

    printPickup(issue.id, issue.title, issue.priority, issue.issue_type);

    // 4. Git reset to default branch (skip in amend mode and simulate mode)
    if (!amend && !simulate) {
      if (!tui.isActive()) {
        process.stdout.write(dim(`  git checkout ${config.github.defaultBranch} && git pull…\n`));
      }
      try {
        checkoutDefault(config.github.defaultBranch, projectRoot);
        pullDefault(config.github.defaultBranch, projectRoot);
      } catch (err) {
        process.stderr.write(error(`\nGit error: ${(err as Error).message}\n`));
        process.exit(1);
      }
    }

    // 5. Assemble prompt
    const bdPrime = simulate ? '' : getPrimeContext();
    const prompt = assemblePrompt(issueDetails, bdPrime, config, localCommits, amend, isFirstIssue);

    // 6. Spawn agent — set up TUI for streaming output
    printAgentStarting();

    const agentStart = Date.now();
    const agentTimeout = opts.timeout ?? config.agent.timeout;
    const agentModel = opts.model ?? config.agent.model ?? 'sonnet';
    log('AGENT', `Spawning: claude -p <prompt> --model ${agentModel} --dangerously-skip-permissions`);
    log('AGENT', `Timeout: ${agentTimeout} minutes`);

    // Start elapsed timer (updates header + footer every second)
    const agentTimer = startElapsedTimer('agent', issue.id, iteration, issueTotal);

    const exitCode = await spawnAgent(prompt, projectRoot, agentTimeout, agentModel).catch(err => {
      agentTimer.stop();
      process.stderr.write(error(`\nAgent error: ${(err as Error).message}\n`));
      process.exit(1);
    });

    agentTimer.stop();

    if (exitCode !== 0) {
      if (!tui.isActive()) {
        const hint = localMode ? 'Checking for local commit…' : 'Attempting PR detection…';
        process.stdout.write(waiting(`\n  Agent exited with code ${exitCode}. ${hint}\n`));
      }
    }

    printAgentComplete();

    const agentElapsed = formatElapsed(Date.now() - agentStart);

    if (simulate) {
      // ── Simulate path: fake the post-agent lifecycle so you see every phase ─
      const fakePrNum = 100 + iteration;
      const fakePrTitle = `feat: ${issueDetails.title.toLowerCase()} (${issue.id})`;
      const fakePrUrl = `https://github.com/${config.github.owner}/${config.github.repo}/pull/${fakePrNum}`;

      // Show polling phase
      if (tui.isActive()) {
        tui.writeHeader({
          issueIdStr: issue.id,
          issueTitle: issueDetails.title ?? issue.title,
          iteration,
          total: issueTotal,
          elapsed: agentElapsed,
          phase: 'polling',
        });
        tui.writeFooter({
          issueIdStr: issue.id,
          phase: 'polling',
          elapsed: agentElapsed,
        });
      }

      // Simulate PR detection delay
      await sleep(1500);
      printPRFound(fakePrNum, fakePrTitle, fakePrUrl);

      // Simulate merge poll delay
      const pollTimer = startElapsedTimer('polling', issue.id, iteration, issueTotal, fakePrNum);
      await sleep(3000);
      pollTimer.stop();

      // Celebrate
      totalIssuesCompleted++;
      totalPrsMerged++;
      simulateCompleted.add(issue.id);
      const remaining = issues.length - 1;

      if (tui.isActive()) {
        tui.writeHeader({
          issueIdStr: issue.id,
          issueTitle: issueDetails.title ?? issue.title,
          iteration,
          total: issueTotal,
          elapsed: formatElapsed(Date.now() - agentStart),
          phase: 'celebration',
        });
        tui.writeFooter({
          issueIdStr: issue.id,
          phase: 'celebration',
          elapsed: formatElapsed(Date.now() - agentStart),
          prNumber: fakePrNum,
        });
      }
      printMerged(fakePrNum, issue.id, remaining);
      await sleep(2000);

    } else if (amend) {
      // ── Amend path: verify commit count, update isFirstIssue, then continue ─
      if (tui.isActive()) {
        tui.writeHeader({
          issueIdStr: issue.id,
          issueTitle: issueDetails.title ?? issue.title,
          iteration,
          total: issueTotal,
          elapsed: agentElapsed,
          phase: 'commit',
        });
        tui.writeFooter({
          issueIdStr: issue.id,
          phase: 'commit',
          elapsed: agentElapsed,
        });
      }

      const commitCount = getCommitCountAhead(config.github.defaultBranch, projectRoot);
      log('GIT', `Commits ahead of ${config.github.defaultBranch}: ${commitCount}`);

      if (commitCount === 0) {
        process.stdout.write(waiting(`\n  Warning: no commit found for ${issue.id}. Next issue will create a fresh commit.\n`));
        // isFirstIssue stays true so next iteration creates a new commit
      } else if (commitCount === 1) {
        printAmendComplete(issue.id, totalIssuesCompleted + 1);
        isFirstIssue = false;
      } else {
        // Agent created multiple commits — warn but proceed
        process.stdout.write(waiting(`\n  Warning: ${commitCount} commits found for ${issue.id} (expected 1). Amend semantics may not have been followed.\n`));
        isFirstIssue = false;
      }

      totalIssuesCompleted++;
      await sleep(1000);

    } else if (localCommits) {
      // ── Local-commits path: verify a commit landed, then continue ──────────
      if (tui.isActive()) {
        tui.writeHeader({
          issueIdStr: issue.id,
          issueTitle: issueDetails.title ?? issue.title,
          iteration,
          total: issueTotal,
          elapsed: agentElapsed,
          phase: 'commit',
        });
        tui.writeFooter({
          issueIdStr: issue.id,
          phase: 'commit',
          elapsed: agentElapsed,
        });
      }

      const newCommits = countNewCommits(config.github.defaultBranch, projectRoot);
      log('GIT', `New commits since ${config.github.defaultBranch}: ${newCommits}`);

      if (newCommits === 0) {
        process.stdout.write(waiting(`\n  Warning: no new commit found for ${issue.id}. Continuing to next issue.\n`));
      } else {
        printCommitVerified(issue.id);
        totalCommitsLanded++;
      }

      totalIssuesCompleted++;
      await sleep(1000);

    } else {
      // ── PR path: detect PR and poll for merge ──────────────────────────────
      if (tui.isActive()) {
        tui.writeHeader({
          issueIdStr: issue.id,
          issueTitle: issueDetails.title ?? issue.title,
          iteration,
          total: issueTotal,
          elapsed: agentElapsed,
          phase: 'polling',
        });
        tui.writeFooter({
          issueIdStr: issue.id,
          phase: 'polling',
          elapsed: agentElapsed,
        });
      }

      // 7. Detect PR
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
        printFailure('no_pr', { issueIdStr: issue.id });
        process.exit(1);
      }
      log('GITHUB', `Found PR #${pr.number}: "${pr.title}"`);

      printPRFound(pr.number, pr.title, pr.html_url);

      // 8. Poll for merge — update footer with PR number
      log('GITHUB', `Polling PR #${pr.number} for merge`);
      const pollTimer = startElapsedTimer('polling', issue.id, iteration, issueTotal, pr.number);

      const result = await pollForMerge(
        octokit!,
        config.github.owner,
        config.github.repo,
        pr.number,
        config,
        (elapsed) => {
          if (!tui.isActive()) {
            process.stdout.write(dim(`  Waiting… ${elapsed}\r`));
          }
          log('GITHUB', `Still waiting… PR #${pr.number} not yet merged (${elapsed} elapsed)`);
        }
      );

      pollTimer.stop();

      switch (result.status) {
        case 'merged': {
          log('GITHUB', `PR #${pr.number} merged successfully`);
          totalIssuesCompleted++;
          totalPrsMerged++;
          const remaining = issues.length - 1;
          if (tui.isActive()) {
            tui.writeHeader({
              issueIdStr: issue.id,
              issueTitle: issueDetails.title ?? issue.title,
              iteration,
              total: issueTotal,
              elapsed: formatElapsed(Date.now() - agentStart),
              phase: 'celebration',
            });
            tui.writeFooter({
              issueIdStr: issue.id,
              phase: 'celebration',
              elapsed: formatElapsed(Date.now() - agentStart),
              prNumber: pr.number,
            });
          }
          printMerged(pr.number, issue.id, remaining);
          await sleep(2000); // Brief celebration pause before next issue
          break;
        }

        case 'closed':
          printFailure('closed', { prNumber: pr.number, prUrl: pr.html_url });
          process.exit(1);
          break;

        case 'ci_failed':
          printFailure('ci_failed', {
            prNumber: pr.number,
            prUrl: result.pr.html_url,
            details: result.details,
          });
          process.exit(1);
          break;

        case 'timeout':
          printFailure('timeout', {
            prNumber: pr.number,
            prUrl: pr.html_url,
            timeoutMinutes: config.poll.mergeTimeout,
          });
          process.exit(1);
          break;
      }
    }

    // Loop back to step 1
  }
}
