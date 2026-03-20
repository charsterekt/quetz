// All user-facing strings, phase panels, celebration screens (spec 6.3)

import { brand, issueId, success, error, waiting, dim } from './terminal.js';
import * as tui from './tui.js';

// ── Issue pickup ─────────────────────────────────────────────────────────────

export function printPickup(id: string, title: string, priority: number, issueType: string): void {
  if (tui.isActive()) {
    // In TUI mode: clear content area and show panel, then scroll down for agent output
    tui.clearContentArea();
    tui.writePanel([
      brand('Summoning agent'),
      '',
      `  Issue  ${issueId(id)}`,
      `  Title  ${title}`,
      `  Type   ${dim(`P${priority} ${issueType}`)}`,
      '',
      waiting('  Spawning Claude Code agent…'),
    ], tui.HEADER_ROWS + 2);
    return;
  }

  process.stdout.write(
    `\n${brand('🐉 Picking up')} ${issueId(id)}: "${title}" ${dim(`[P${priority} ${issueType}]`)}\n` +
    `   ${dim('──── Summoning agent ────')}\n\n`
  );
}

// ── Transition to agent output ────────────────────────────────────────────────

export function printAgentStarting(): void {
  if (tui.isActive()) {
    // Clear panel, set scroll region so agent output fills content area
    tui.clearContentArea();
    tui.setupScrollRegion();
    // Brief separator before agent output flows in
    process.stdout.write(dim('  ─── agent output below ───') + '\n\n');
    return;
  }
  process.stdout.write(dim('\n  Starting agent…\n'));
}

// ── Agent complete ────────────────────────────────────────────────────────────

export function printAgentComplete(): void {
  if (tui.isActive()) {
    // Reset scroll region so we can write full-screen panels again
    process.stdout.write(tui.ANSI.resetScroll);
    return;
  }
  process.stdout.write(
    `\n   ${dim('──── Agent session complete ────')}\n` +
    `${waiting('🔍 Searching for PR…')}\n`
  );
}

// ── PR found ─────────────────────────────────────────────────────────────────

export function printPRFound(prNumber: number, prTitle: string, prUrl: string): void {
  if (tui.isActive()) {
    tui.clearContentArea();
    tui.writePanel([
      success(`✓  PR #${prNumber} detected`),
      '',
      `  ${prTitle}`,
      `  ${dim(prUrl)}`,
      '',
      waiting('  Watching for merge…'),
    ], tui.HEADER_ROWS + 2);
    return;
  }
  process.stdout.write(
    `${success(`✓  Found PR #${prNumber}`)}: "${prTitle}"\n` +
    `   ${dim(prUrl)}\n` +
    `   ${waiting('Watching for merge…')}\n`
  );
}

// ── Merge celebration (spec 6.3) ──────────────────────────────────────────────

export function printMerged(prNumber: number, id: string, remaining: number): void {
  if (tui.isActive()) {
    tui.clearContentArea();
    const remainingStr = remaining === 0
      ? success('All issues resolved!')
      : dim(`${remaining} issue${remaining === 1 ? '' : 's'} remaining`);
    tui.writePanel([
      '',
      success(`  ✓  PR #${prNumber} MERGED`),
      '',
      `  ${brand(`The serpent devours ${id}.`)}`,
      '',
      `  ${remainingStr}`,
      '',
    ], tui.HEADER_ROWS + 2);
    return;
  }
  process.stdout.write(
    `\n${success(`✅ PR #${prNumber} merged!`)} ${brand(`The serpent devours ${id}.`)}\n` +
    `   ${dim('─'.repeat(40))}\n` +
    `   Issues remaining: ${remaining}\n` +
    `   ${dim('─'.repeat(40))}\n\n`
  );
}

// ── Commit verified (local-commits mode) ─────────────────────────────────────

export function printCommitVerified(id: string, commitHash?: string): void {
  const hashStr = commitHash ? ` ${dim(commitHash.slice(0, 7))}` : '';
  if (tui.isActive()) {
    tui.clearContentArea();
    tui.writePanel([
      '',
      success(`  ✓  Commit landed${hashStr}`),
      '',
      `  ${brand(`The serpent devours ${id}.`)}`,
      '',
    ], tui.HEADER_ROWS + 2);
    return;
  }
  process.stdout.write(
    `\n${success(`✓ Commit landed${hashStr}`)} ${brand(`The serpent devours ${id}.`)}\n\n`
  );
}

// ── Amend iteration complete ──────────────────────────────────────────────────

export function printAmendComplete(id: string, issueNumber: number): void {
  if (tui.isActive()) {
    tui.clearContentArea();
    tui.writePanel([
      '',
      success(`  ✓  Amend ${issueNumber} complete`),
      '',
      `  ${brand(`The serpent folds ${id} into the commit.`)}`,
      '',
    ], tui.HEADER_ROWS + 2);
    return;
  }
  process.stdout.write(
    `\n${success(`✓ Amend ${issueNumber} complete`)} ${brand(`The serpent folds ${id} into the commit.`)}\n\n`
  );
}

// ── Victory screen (spec 6.3) ─────────────────────────────────────────────────

export interface VictoryStats {
  issuesCompleted: number;
  totalTime: string;
  prsMerged: number;
  mode?: 'pr' | 'local-commits' | 'amend';
  commitsLanded?: number;
  commitHash?: string;
  commitMsg?: string;
}

export function printVictory(stats: VictoryStats): void {
  const isLocalCommits = stats.mode === 'local-commits';
  const isAmend = stats.mode === 'amend';
  const statLabel = isAmend ? 'Commit ready  ' : (isLocalCommits ? 'Commits landed' : 'PRs merged    ');
  const statValue = isAmend
    ? (stats.commitHash ? stats.commitHash.slice(0, 7) : '1')
    : (isLocalCommits ? String(stats.commitsLanded ?? stats.issuesCompleted) : String(stats.prsMerged));

  const amendReadyLine = isAmend
    ? `  ${success('1 commit ready to push.')} ${dim(stats.commitHash ? stats.commitHash.slice(0, 7) : '')}${stats.commitMsg ? ' ' + dim(stats.commitMsg) : ''}`
    : '';

  if (tui.isActive()) {
    const panels: string[] = [
      '',
      success('  ✓  QUETZ VICTORY'),
      '',
      `  Issues completed   ${brand(String(stats.issuesCompleted))}`,
      `  ${statLabel}   ${brand(statValue)}`,
      `  Total time         ${dim(stats.totalTime)}`,
      '',
      `  ${dim('The serpent rests. 🐉')}`,
      '',
      `  ${dim('All issues resolved.')}`,
    ];
    if (isAmend && amendReadyLine) panels.push('', amendReadyLine);
    panels.push('');
    tui.clearContentArea();
    tui.writePanel(panels, tui.HEADER_ROWS + 2);
    return;
  }
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

// ── Failure messages (spec 6.3) ───────────────────────────────────────────────

export function printFailure(
  reason: 'ci_failed' | 'timeout' | 'no_pr' | 'closed',
  opts: { prNumber?: number; prUrl?: string; issueIdStr?: string; details?: string; timeoutMinutes?: number }
): void {
  const lines: string[] = [];

  switch (reason) {
    case 'ci_failed':
      lines.push(error(`  💥  CI failed on PR #${opts.prNumber}`));
      if (opts.details) lines.push(`  ${dim(opts.details)}`);
      if (opts.prUrl) lines.push(`  ${dim(opts.prUrl)}`);
      break;
    case 'timeout':
      lines.push(error(`  ⏰  Merge timeout (${opts.timeoutMinutes}m) exceeded`));
      lines.push(`  PR #${opts.prNumber}`);
      if (opts.prUrl) lines.push(`  ${dim(opts.prUrl)}`);
      break;
    case 'no_pr':
      lines.push(error(`  🔍  No PR found referencing ${opts.issueIdStr}`));
      break;
    case 'closed':
      lines.push(error(`  ❌  PR #${opts.prNumber} closed without merging`));
      if (opts.prUrl) lines.push(`  ${dim(opts.prUrl)}`);
      break;
  }
  lines.push('');
  lines.push(`  ${error('The serpent retreats.')} Fix the issue and run quetz again.`);

  if (tui.isActive()) {
    tui.clearContentArea();
    tui.writePanel(['', ...lines, ''], tui.HEADER_ROWS + 2);
    return;
  }

  process.stdout.write('\n');
  for (const line of lines) process.stdout.write(line.replace(/^ {2}/, '') + '\n');
  process.stdout.write('\n');
}
