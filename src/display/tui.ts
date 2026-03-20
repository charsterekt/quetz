// Full-screen TUI: alternate screen buffer, scroll regions, cursor management

import { brand, issueId, success, waiting, dim, chrome } from './terminal.js';

// ── ANSI escape sequences ────────────────────────────────────────────────────

export const ANSI = {
  enterAlt:     '\x1b[?1049h',  // Enter alternate screen buffer
  exitAlt:      '\x1b[?1049l',  // Exit alternate screen buffer
  hideCursor:   '\x1b[?25l',    // Hide cursor
  showCursor:   '\x1b[?25h',    // Show cursor
  clearScreen:  '\x1b[2J',      // Clear entire screen
  clearDown:    '\x1b[J',       // Clear from cursor to bottom
  home:         '\x1b[H',       // Move cursor to (1,1)
  saveCursor:   '\x1b7',        // DEC save cursor position
  restoreCursor:'\x1b8',        // DEC restore cursor position
  clearLine:    '\x1b[2K',      // Clear entire current line
  clearEol:     '\x1b[K',       // Clear from cursor to end of line
  move:     (row: number, col: number) => `\x1b[${row};${col}H`,
  scrollRegion: (top: number, bot: number) => `\x1b[${top};${bot}r`,
  resetScroll:  '\x1b[r',       // Reset scroll region to full screen
} as const;

// ── ANSI strip ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const STRIP_RE = /\x1b\[[0-9;]*[mABCDHJKfsu]|\x1b[78]/g;
export function stripAnsi(s: string): string { return s.replace(STRIP_RE, ''); }

// ── Dimensions ───────────────────────────────────────────────────────────────

export const HEADER_ROWS = 3;  // 3-line box: ╭─╮ / │ content │ / ╰─╯
export const FOOTER_ROWS = 2;  // separator line + status line

export function rows(): number { return process.stdout.rows ?? 24; }
export function cols(): number { return process.stdout.columns ?? 80; }

// ── Lifecycle ────────────────────────────────────────────────────────────────

let _active = false;
let _resizePending = false;

export function enter(): void {
  if (_active) return;
  _active = true;
  process.stdout.write(ANSI.enterAlt + ANSI.hideCursor + ANSI.clearScreen + ANSI.home);
  process.on('exit', _cleanup);
  process.on('SIGINT', _exitAndCleanup);
  process.stdout.on('resize', _onResize);
}

function _cleanup(): void {
  if (!_active) return;
  _active = false;
  process.stdout.write(ANSI.resetScroll + ANSI.showCursor + ANSI.exitAlt);
}

function _exitAndCleanup(): void { _cleanup(); process.exit(0); }
function _onResize(): void { _resizePending = true; }

export function exit(): void { _cleanup(); }
export function isActive(): boolean { return _active; }
export function consumeResize(): boolean {
  const p = _resizePending;
  _resizePending = false;
  return p;
}

// ── Layout helpers ───────────────────────────────────────────────────────────

/** Set scroll region to content zone (between header and footer). */
export function setupScrollRegion(): void {
  const r = rows();
  process.stdout.write(
    ANSI.scrollRegion(HEADER_ROWS + 1, r - FOOTER_ROWS) +
    ANSI.move(HEADER_ROWS + 1, 1)
  );
}

/** Clear the content zone (between header and footer). */
export function clearContentArea(): void {
  const r = rows();
  process.stdout.write(ANSI.move(HEADER_ROWS + 1, 1) + ANSI.clearDown);
  // Re-position at content top (clearDown may not respect scroll region)
  process.stdout.write(ANSI.move(HEADER_ROWS + 1, 1));
}

// ── Phase types ──────────────────────────────────────────────────────────────

export type Phase = 'startup' | 'agent' | 'polling' | 'commit' | 'celebration' | 'victory';

export interface HeaderData {
  issueIdStr: string;
  issueTitle: string;
  iteration: number;
  total: number;
  elapsed: string;
  phase: Phase;
}

export interface FooterData {
  issueIdStr: string;
  phase: Phase;
  elapsed: string;
  prNumber?: number;
}

// ── Header rendering ─────────────────────────────────────────────────────────

function phaseBadge(phase: Phase): string {
  switch (phase) {
    case 'agent':       return waiting(' ◈ AGENT ');
    case 'polling':     return brand(' ◈ POLLING ');
    case 'commit':      return success(' ◈ COMMIT ');
    case 'celebration': return success(' ✓ MERGED ');
    case 'victory':     return success(' ✓ DONE ');
    default:            return dim(' ◦ START ');
  }
}

export function writeHeader(data: HeaderData): void {
  const w = cols();
  const badge = phaseBadge(data.phase);
  const titleClip = data.issueTitle.length > 30
    ? data.issueTitle.slice(0, 29) + '…'
    : data.issueTitle;
  const titleSuffix = titleClip ? dim(` · "${titleClip}"`) : '';
  const left = brand('▐ QUETZ ▌') + (data.issueIdStr
    ? ' ' + issueId(data.issueIdStr) + titleSuffix
    : '');
  const right = dim(`Issue ${data.iteration}/${data.total}  ⏱ ${data.elapsed}`);

  const usedLen = stripAnsi(left).length + stripAnsi(badge).length + stripAnsi(right).length + 2;
  const gap = Math.max(0, w - 2 - usedLen);

  const top = chrome('╭' + '─'.repeat(w - 2) + '╮');
  const mid = chrome('│') + ' ' + left + ' '.repeat(Math.floor(gap / 2))
    + badge + ' '.repeat(Math.ceil(gap / 2)) + right + ' ' + chrome('│');
  const bot = chrome('╰' + '─'.repeat(w - 2) + '╯');

  process.stdout.write(
    ANSI.move(1, 1) + top + ANSI.clearEol + '\r\n' +
    mid + ANSI.clearEol + '\r\n' +
    bot + ANSI.clearEol
  );
}

// ── Footer rendering ─────────────────────────────────────────────────────────

export function writeFooter(data: FooterData): void {
  const w = cols();
  const r = rows();

  const phaseStr = (() => {
    switch (data.phase) {
      case 'agent':       return waiting('Agent running…');
      case 'polling':     return waiting(data.prNumber ? `Polling PR #${data.prNumber}` : 'Searching for PR…');
      case 'celebration': return success('Merged ✓');
      case 'victory':     return success('The serpent rests.');
      default:            return dim('Starting…');
    }
  })();

  const left = brand('[quetz]')
    + (data.issueIdStr
      ? '  ' + issueId(data.issueIdStr) + '  ' + dim('│') + '  ' + phaseStr
      : '  ' + phaseStr);
  const right = dim(data.elapsed);
  const gap = Math.max(1, w - stripAnsi(left).length - stripAnsi(right).length - 2);

  process.stdout.write(
    ANSI.saveCursor +
    ANSI.move(r - 1, 1) + chrome('─'.repeat(w)) + ANSI.clearEol +
    ANSI.move(r, 1) + ' ' + left + ' '.repeat(gap) + right + ' ' + ANSI.clearEol +
    ANSI.restoreCursor
  );
}

// ── Centered text helpers ────────────────────────────────────────────────────

/** Write lines centered horizontally, starting at the given row. */
export function writeCentered(lines: string[], startRow: number): void {
  const w = cols();
  for (let i = 0; i < lines.length; i++) {
    const raw = stripAnsi(lines[i]);
    const pad = Math.max(0, Math.floor((w - raw.length) / 2));
    process.stdout.write(ANSI.move(startRow + i, 1) + ' '.repeat(pad) + lines[i] + ANSI.clearEol);
  }
}

/** Draw a centered box panel with rounded corners and given content lines. */
export function writePanel(contentLines: string[], startRow: number): void {
  const w = cols();
  const innerW = Math.min(60, w - 4);
  const boxL = Math.max(0, Math.floor((w - innerW - 2) / 2));

  const top = chrome('╭' + '─'.repeat(innerW) + '╮');
  const bot = chrome('╰' + '─'.repeat(innerW) + '╯');

  process.stdout.write(ANSI.move(startRow, 1) + ' '.repeat(boxL) + top + ANSI.clearEol);
  let row = startRow + 1;

  for (const line of contentLines) {
    const raw = stripAnsi(line);
    const pad = Math.max(0, innerW - raw.length - 1);
    process.stdout.write(
      ANSI.move(row, 1) + ' '.repeat(boxL) +
      chrome('│') + ' ' + line + ' '.repeat(pad) + chrome('│') + ANSI.clearEol
    );
    row++;
  }

  process.stdout.write(ANSI.move(row, 1) + ' '.repeat(boxL) + bot + ANSI.clearEol);
}
