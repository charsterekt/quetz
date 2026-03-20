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

// ── Victory screen (spec 6.3) ─────────────────────────────────────────────────

export interface VictoryStats {
  issuesCompleted: number;
  totalTime: string;
  prsMerged: number;
}

export function printVictory(stats: VictoryStats): void {
  if (tui.isActive()) {
    tui.clearContentArea();
    tui.writePanel([
      '',
      success('  ✓  QUETZ VICTORY'),
      '',
      `  Issues completed   ${brand(String(stats.issuesCompleted))}`,
      `  PRs merged         ${brand(String(stats.prsMerged))}`,
      `  Total time         ${dim(stats.totalTime)}`,
      '',
      `  ${dim('The serpent rests. 🐉')}`,
      '',
      `  ${dim('All issues resolved.')}`,
      '',
    ], tui.HEADER_ROWS + 2);
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
    `   ${brand('║')}    PRs merged: ${String(stats.prsMerged).padEnd(21)} ${brand('║')}\n` +
    `   ${brand('║')}                                      ${brand('║')}\n` +
    `   ${brand('║')}    ${dim('The serpent rests. 🐉')}              ${brand('║')}\n` +
    `   ${brand('║')}                                      ${brand('║')}\n` +
    `   ${brand('╚══════════════════════════════════════╝')}\n\n`
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
