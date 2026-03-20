// All user-facing strings, fun status messages (spec 6.3)

import { brand, issueId, success, error, waiting, dim, separator } from './terminal.js';

// ── Issue pickup (spec 6.3) ─────────────────────────────────────────────────

export function printPickup(id: string, title: string, priority: number, issueType: string): void {
  process.stdout.write(
    `\n${brand('🐉 Picking up')} ${issueId(id)}: "${title}" ${dim(`[P${priority} ${issueType}]`)}\n` +
    `   ${separator('──── Summoning agent ────')}\n\n`
  );
}

// ── Agent complete (spec 6.3) ───────────────────────────────────────────────

export function printAgentComplete(): void {
  process.stdout.write(
    `\n   ${separator('──── Agent session complete ────')}\n` +
    `${waiting('🔍 Searching for PR...')}\n`
  );
}

// ── PR found ────────────────────────────────────────────────────────────────

export function printPRFound(prNumber: number, prTitle: string, prUrl: string): void {
  process.stdout.write(
    `${success(`✓  Found PR #${prNumber}`)}: "${prTitle}"\n` +
    `   ${dim(prUrl)}\n` +
    `   ${waiting('Watching for merge...')}\n`
  );
}

// ── Merge success (spec 6.3) ────────────────────────────────────────────────

export function printMerged(prNumber: number, id: string, remaining: number): void {
  process.stdout.write(
    `\n${success(`✅ PR #${prNumber} merged!`)} ${brand(`The serpent devours ${id}.`)}\n` +
    `   ${separator('─'.repeat(40))}\n` +
    `   Issues remaining: ${remaining}\n` +
    `   ${separator('─'.repeat(40))}\n\n`
  );
}

// ── Victory screen (spec 6.3) ───────────────────────────────────────────────

export interface VictoryStats {
  issuesCompleted: number;
  totalTime: string;
  prsMerged: number;
}

export function printVictory(stats: VictoryStats): void {
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

// ── Failure messages (spec 6.3) ──────────────────────────────────────────────

export function printFailure(
  reason: 'ci_failed' | 'timeout' | 'no_pr' | 'closed',
  opts: { prNumber?: number; prUrl?: string; issueIdStr?: string; details?: string; timeoutMinutes?: number }
): void {
  switch (reason) {
    case 'ci_failed':
      process.stdout.write(
        `\n${error(`💥 CI failed on PR #${opts.prNumber}`)}\n` +
        (opts.details ? `   ${dim(opts.details)}\n` : '') +
        `   ${dim('→')} ${dim(opts.prUrl ?? '')}\n` +
        `\n   ${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
      );
      break;

    case 'timeout':
      process.stdout.write(
        `\n${error(`⏰ Merge timeout (${opts.timeoutMinutes}m) exceeded for PR #${opts.prNumber}`)}\n` +
        `   ${dim('→')} ${dim(opts.prUrl ?? '')}\n` +
        `\n   ${error('The serpent retreats.')} Check the PR and run quetz again.\n\n`
      );
      break;

    case 'no_pr':
      process.stdout.write(
        `\n${error(`🔍 No PR found referencing ${opts.issueIdStr}`)}\n` +
        `\n   ${error('The serpent retreats.')} Check that the agent created a PR and run quetz again.\n\n`
      );
      break;

    case 'closed':
      process.stdout.write(
        `\n${error(`❌ PR #${opts.prNumber} was closed without merging`)}\n` +
        `   ${dim('→')} ${dim(opts.prUrl ?? '')}\n` +
        `\n   ${error('The serpent retreats.')} Fix the issue and run quetz again.\n\n`
      );
      break;
  }
}
