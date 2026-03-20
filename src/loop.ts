import chalk from 'chalk';
import { loadConfig } from './config.js';
import { getReadyIssues, getIssueDetails, getPrimeContext } from './beads.js';
import { checkoutDefault, pullDefault } from './git.js';
import { assemblePrompt } from './prompt.js';
import { spawnAgent } from './agent.js';
import { createOctokit, findPR, pollForMerge } from './github.js';
import { setVerbose, log } from './verbose.js';
import { execSync } from 'child_process';

// ── Status command ──────────────────────────────────────────────────────────

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
    ? chalk.cyan(`${nextIssue.id} "${nextIssue.title}" [P${nextIssue.priority}]`)
    : chalk.gray('none');

  return (
    chalk.bold('Quetz Status\n') +
    '════════════\n' +
    new Date().toLocaleTimeString() + '\n\n' +
    (total > 0
      ? `Issues: ${chalk.green(String(ready))} ready / ${chalk.yellow(String(inProgress))} in progress / ${chalk.gray(String(completed))} completed / ${chalk.dim(String(total))} total\n`
      : `Issues: ${chalk.green(String(ready))} ready\n`) +
    `Next:   ${nextLabel}\n` +
    `Config: ${config.github.owner}/${config.github.repo} (${config.github.defaultBranch})\n`
  );
}

export async function showStatus(watch: boolean = false): Promise<void> {
  const config = loadConfig();

  if (watch) {
    process.stdout.write(chalk.bold('\nQuetz Status (--watch mode)\n'));
    process.stdout.write('Press Ctrl+C to exit\n\n');

    while (true) {
      // Get ready (unblocked) issues
      let readyIssues: { id: string; title: string; priority: number }[] = [];
      try {
        readyIssues = getReadyIssues();
      } catch {
        process.stderr.write(chalk.red('Failed to query bd ready.\n'));
        process.exit(1);
      }

      // Get all issues via bd list
      let allIssues: { status: string }[] = [];
      try {
        const raw = execSync('bd list --json', { encoding: 'utf-8' });
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allIssues = parsed as { status: string }[];
      } catch {
        // bd list may not exist; fall back gracefully
      }

      const total = allIssues.length;
      const inProgress = allIssues.filter(i => i.status === 'in_progress').length;
      const completed = allIssues.filter(i => i.status === 'closed' || i.status === 'done').length;
      const ready = readyIssues.length;
      const nextIssue = readyIssues[0];

      // Clear screen and display
      process.stdout.write('\x1b[2J\x1b[0f');
      process.stdout.write(getStatusDisplay(ready, inProgress, completed, total, nextIssue, config));

      // Wait 5 seconds before refreshing
      await sleep(5000);
    }
  } else {
    // One-shot status display
    let readyIssues: { id: string; title: string; priority: number }[] = [];
    try {
      readyIssues = getReadyIssues();
    } catch {
      process.stderr.write(chalk.red('Failed to query bd ready.\n'));
      process.exit(1);
    }

    // Get all issues via bd list
    let allIssues: { status: string }[] = [];
    try {
      const raw = execSync('bd list --json', { encoding: 'utf-8' });
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) allIssues = parsed as { status: string }[];
    } catch {
      // bd list may not exist; fall back gracefully
    }

    const total = allIssues.length;
    const inProgress = allIssues.filter(i => i.status === 'in_progress').length;
    const completed = allIssues.filter(i => i.status === 'closed' || i.status === 'done').length;
    const ready = readyIssues.length;
    const nextIssue = readyIssues[0];

    process.stdout.write('\n' + getStatusDisplay(ready, inProgress, completed, total, nextIssue, config));
  }
}

// ── Run loop ────────────────────────────────────────────────────────────────

export async function runLoop(opts: { dry: boolean; model?: string; timeout?: number; verbose?: boolean }): Promise<void> {
  // Set verbose mode early so all modules can log
  if (opts.verbose) {
    setVerbose(true);
    log('QUETZ', 'Verbose mode enabled');
  }

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);
  if (opts.verbose) {
    log('CONFIG', `Loaded: ${config.github.owner}/${config.github.repo} (${config.github.defaultBranch})`);
  }

  // ── Dry-run: print issue list + first prompt, then exit ─────────────────
  if (opts.dry) {
    let issues: ReturnType<typeof getReadyIssues>;
    try {
      issues = getReadyIssues();
    } catch (err) {
      process.stderr.write(chalk.red(`\nbd ready failed: ${(err as Error).message}\n`));
      process.exit(1);
    }

    if (issues.length === 0) {
      process.stdout.write(chalk.yellow('\nNo ready issues found. The serpent sleeps.\n'));
      process.exit(0);
    }

    process.stdout.write(chalk.bold('\nIssue Queue (priority order):\n'));
    process.stdout.write('─'.repeat(50) + '\n');
    for (const [i, issue] of issues.entries()) {
      process.stdout.write(
        chalk.cyan(`${i + 1}. ${issue.id}`) +
        ` [P${issue.priority}] [${issue.issue_type}] ${issue.title}\n`
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
    const prompt = assemblePrompt(issueDetails, bdPrime, config);

    process.stdout.write(chalk.bold('Prompt for first issue:\n'));
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write(prompt + '\n');
    process.stdout.write('─'.repeat(50) + '\n');
    process.stdout.write(chalk.bold('\n--- Dry run complete (no agent spawned) ---\n'));
    process.exit(0);
  }

  // ── Normal run loop ──────────────────────────────────────────────────────
  const octokit = createOctokit();
  let iteration = 0;

  while (true) {
    iteration++;

    // 1. Get next ready issue
    let issues: ReturnType<typeof getReadyIssues>;
    try {
      issues = getReadyIssues();
    } catch (err) {
      process.stderr.write(chalk.red(`\nbd ready failed: ${(err as Error).message}\n`));
      process.exit(1);
    }

    if (issues.length === 0) {
      if (iteration === 1) {
        process.stdout.write(chalk.yellow('\nNo ready issues found. The serpent sleeps.\n'));
      } else {
        process.stdout.write(
          chalk.green('\n✓ All issues resolved. The serpent rests.\n') +
          chalk.bold('   ~~~ QUETZ VICTORY ~~~\n\n')
        );
      }
      process.exit(0);
    }

    const issue = issues[0];

    process.stdout.write(
      chalk.bold(`\n[${iteration}] Issue: `) +
      chalk.cyan(`${issue.id} — "${issue.title}"`) +
      chalk.gray(` [P${issue.priority}]\n`)
    );

    // 2. Git reset to default branch
    process.stdout.write(chalk.gray(`  git checkout ${config.github.defaultBranch} && git pull...\n`));
    try {
      checkoutDefault(config.github.defaultBranch, projectRoot);
      pullDefault(config.github.defaultBranch, projectRoot);
    } catch (err) {
      process.stderr.write(chalk.red(`\nGit error: ${(err as Error).message}\n`));
      process.exit(1);
    }

    // 3. Get full issue details and assemble prompt
    let issueDetails = issue;
    try {
      issueDetails = getIssueDetails(issue.id);
    } catch {
      // fall back to ready data
    }
    const bdPrime = getPrimeContext();
    const prompt = assemblePrompt(issueDetails, bdPrime, config);

    // 4. Spawn agent
    process.stdout.write(chalk.gray('\n  Spawning agent...\n'));
    const spawnTime = new Date();
    const agentTimeout = opts.timeout ?? config.agent.timeout;
    const agentModel = opts.model ?? config.agent.model ?? 'sonnet';
    log('AGENT', `Spawning: claude -p <prompt> --model ${agentModel} --dangerously-skip-permissions`);
    log('AGENT', `Timeout: ${agentTimeout} minutes`);
    log('AGENT', `Working directory: ${projectRoot}`);
    log('AGENT', `Prompt length: ${prompt.length} characters`);
    const exitCode = await spawnAgent(prompt, projectRoot, agentTimeout, agentModel).catch(err => {
      process.stderr.write(chalk.red(`\nAgent error: ${(err as Error).message}\n`));
      process.exit(1);
    });

    if (exitCode !== 0) {
      process.stdout.write(
        chalk.yellow(`\n  Agent exited with code ${exitCode}. Attempting PR detection...\n`)
      );
    }

    // 5. Detect PR
    process.stdout.write(chalk.gray('  Looking for PR...\n'));
    log('GITHUB', `Searching for PR referencing ${issue.id}`);
    log('GITHUB', `Will check PRs created after ${spawnTime.toISOString()}`);
    log('GITHUB', `Detection timeout: ${config.poll.prDetectionTimeout}s`);
    const pr = await findPR(
      octokit,
      config.github.owner,
      config.github.repo,
      issue.id,
      spawnTime,
      config.poll.prDetectionTimeout
    );

    if (!pr) {
      log('GITHUB', `PR detection timed out after ${config.poll.prDetectionTimeout}s`);
      process.stderr.write(
        chalk.red(`\nNo PR found referencing ${issue.id} within ${config.poll.prDetectionTimeout}s of agent exit.\n`)
      );
      process.exit(1);
    }
    log('GITHUB', `Found PR #${pr.number}: "${pr.title}"`);

    process.stdout.write(chalk.green(`  Found PR #${pr.number}: ${pr.title}\n`));
    process.stdout.write(chalk.gray(`  ${pr.html_url}\n`));

    // 6. Poll for merge
    process.stdout.write(chalk.gray('  Polling for merge...\n'));
    log('GITHUB', `Polling PR #${pr.number} for merge (interval: ${config.poll.interval}s, timeout: ${config.poll.mergeTimeout}m)`);
    const result = await pollForMerge(
      octokit,
      config.github.owner,
      config.github.repo,
      pr.number,
      config,
      (elapsed) => {
        process.stdout.write(chalk.gray(`  Waiting... ${elapsed}\r`));
        log('GITHUB', `Still waiting... PR #${pr.number} not yet merged (${elapsed} elapsed)`);
      }
    );

    switch (result.status) {
      case 'merged':
        log('GITHUB', `PR #${pr.number} merged successfully`);
        process.stdout.write(chalk.green(`\n  Merged! ${result.pr.html_url}\n`));
        break;

      case 'closed':
        process.stderr.write(
          chalk.red(`\nPR #${pr.number} was closed without merging.\n  ${pr.html_url}\n`)
        );
        process.exit(1);
        break;

      case 'ci_failed':
        process.stderr.write(
          chalk.red(`\nCI failed on PR #${pr.number}.\n  ${result.details ?? ''}\n  ${pr.html_url}\n`)
        );
        process.exit(1);
        break;

      case 'timeout':
        process.stderr.write(
          chalk.red(`\nMerge timeout (${config.poll.mergeTimeout}m) exceeded for PR #${pr.number}.\n  ${pr.html_url}\n`)
        );
        process.exit(1);
        break;
    }

    // Loop back to step 1
  }
}
