// All user-facing strings, phase messages, celebration screens (spec 6.3)

import { brand, issueId, success, error, waiting, dim } from './terminal.js';

// ── Issue pickup ─────────────────────────────────────────────────────────────

export function printPickup(id: string, title: string, priority: number, issueType: string): void {
  process.stdout.write(
    `\n${brand('🐉 Picking up')} ${issueId(id)}: "${title}" ${dim(`[P${priority} ${issueType}]`)}\n` +
    `   ${dim('──── Summoning agent ────')}\n\n`
  );
}

// ── Transition to agent output ────────────────────────────────────────────────

export function printAgentStarting(): void {
  process.stdout.write(dim('\n  Starting agent…\n'));
}

// ── Agent complete ────────────────────────────────────────────────────────────

export function printAgentComplete(): void {
  process.stdout.write(
    `\n   ${dim('──── Agent session complete ────')}\n` +
    `${waiting('🔍 Searching for PR…')}\n`
  );
}

// ── PR found ─────────────────────────────────────────────────────────────────

export function printPRFound(prNumber: number, prTitle: string, prUrl: string): void {
  process.stdout.write(
    `${success(`✓  Found PR #${prNumber}`)}: "${prTitle}"\n` +
    `   ${dim(prUrl)}\n` +
    `   ${waiting('Watching for merge…')}\n`
  );
}

// ── Merge celebration (spec 6.3) ──────────────────────────────────────────────

export function printMerged(prNumber: number, id: string, remaining: number): void {
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
  process.stdout.write(
    `\n${success(`✓ Commit landed${hashStr}`)} ${brand(`The serpent devours ${id}.`)}\n\n`
  );
}

// ── Amend iteration complete ──────────────────────────────────────────────────

export function printAmendComplete(id: string, issueNumber: number): void {
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
      lines.push(error(`💥  CI failed on PR #${opts.prNumber}`));
      if (opts.details) lines.push(dim(opts.details));
      if (opts.prUrl) lines.push(dim(opts.prUrl));
      break;
    case 'timeout':
      lines.push(error(`⏰  Merge timeout (${opts.timeoutMinutes}m) exceeded`));
      lines.push(`PR #${opts.prNumber}`);
      if (opts.prUrl) lines.push(dim(opts.prUrl));
      break;
    case 'no_pr':
      lines.push(error(`🔍  No PR found referencing ${opts.issueIdStr}`));
      break;
    case 'closed':
      lines.push(error(`❌  PR #${opts.prNumber} closed without merging`));
      if (opts.prUrl) lines.push(dim(opts.prUrl));
      break;
  }
  lines.push('');
  lines.push(`${error('The serpent retreats.')} Fix the issue and run quetz again.`);

  process.stdout.write('\n');
  for (const line of lines) process.stdout.write(line + '\n');
  process.stdout.write('\n');
}
