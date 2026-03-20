// Persistent status line management (spec 6.4)

import { brand, issueId, waiting, dim } from './terminal.js';
import * as tui from './tui.js';

export interface StatusState {
  iteration: number;
  total: number;
  issueIdStr: string;
  phase: 'agent' | 'polling';
  elapsed: string;
  prNumber?: number;
}

let lastLineLength = 0;

export function formatStatusLine(state: StatusState): string {
  const counter = `[quetz] Issue ${state.iteration}/${state.total}`;
  const id = state.issueIdStr;

  if (state.phase === 'agent') {
    return `${counter} | ${id} | Agent running... (${state.elapsed})`;
  }

  const prLabel = state.prNumber ? `PR #${state.prNumber} — ` : '';
  return `${counter} | ${id} | ${prLabel}waiting for merge (${state.elapsed})`;
}

export function renderStatusLine(state: StatusState): string {
  const counter = `Issue ${state.iteration}/${state.total}`;
  const id = issueId(state.issueIdStr);

  if (state.phase === 'agent') {
    return `${brand('[quetz]')} ${counter} | ${id} | ${waiting('Agent running...')} ${dim(`(${state.elapsed})`)}`;
  }

  const prLabel = state.prNumber ? `PR #${state.prNumber} — ` : '';
  return `${brand('[quetz]')} ${counter} | ${id} | ${waiting(`${prLabel}waiting for merge`)} ${dim(`(${state.elapsed})`)}`;
}

export function updateStatusLine(state: StatusState): void {
  if (tui.isActive()) {
    // Use absolute cursor positioning to update sticky footer
    tui.writeFooter({
      issueIdStr: state.issueIdStr,
      phase: state.phase,
      elapsed: state.elapsed,
      prNumber: state.prNumber,
    });
    return;
  }

  // Fallback: carriage-return overwrite for non-TUI mode
  const line = renderStatusLine(state);
  const plain = formatStatusLine(state);
  const clearLen = Math.max(lastLineLength, plain.length);
  process.stdout.write(`\r${' '.repeat(clearLen)}\r${line}`);
  lastLineLength = plain.length;
}

export function clearStatusLine(): void {
  if (tui.isActive()) return; // Footer persists in TUI mode
  if (lastLineLength > 0) {
    process.stdout.write(`\r${' '.repeat(lastLineLength)}\r`);
    lastLineLength = 0;
  }
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
