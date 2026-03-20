import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock terminal helpers
vi.mock('../display/terminal.js', () => ({
  brand:  (t: string) => t,
  issueId:(t: string) => t,
  success:(t: string) => t,
  waiting:(t: string) => t,
  error:  (t: string) => t,
  dim:    (t: string) => t,
  chrome: (t: string) => t,
}));

import {
  ANSI,
  stripAnsi,
  rows, cols,
  HEADER_ROWS, FOOTER_ROWS,
  enter, exit, isActive,
  setupScrollRegion, clearContentArea,
  writeHeader, writeFooter, writeCentered, writePanel,
  type HeaderData, type FooterData,
} from '../display/tui.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  // Ensure clean state — call internal cleanup via exit() if active
  if (isActive()) exit();
});

function getOutput(): string {
  return stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
}

// ── ANSI constants ────────────────────────────────────────────────────────────

describe('ANSI constants', () => {
  it('enter/exit alt screen sequences are correct', () => {
    expect(ANSI.enterAlt).toBe('\x1b[?1049h');
    expect(ANSI.exitAlt).toBe('\x1b[?1049l');
  });

  it('cursor hide/show sequences are correct', () => {
    expect(ANSI.hideCursor).toBe('\x1b[?25l');
    expect(ANSI.showCursor).toBe('\x1b[?25h');
  });

  it('move() generates correct escape sequence', () => {
    expect(ANSI.move(3, 1)).toBe('\x1b[3;1H');
    expect(ANSI.move(10, 5)).toBe('\x1b[10;5H');
  });

  it('scrollRegion() generates correct escape sequence', () => {
    expect(ANSI.scrollRegion(4, 22)).toBe('\x1b[4;22r');
  });
});

// ── stripAnsi ────────────────────────────────────────────────────────────────

describe('stripAnsi', () => {
  it('removes color codes', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
    expect(stripAnsi('\x1b[1;36mquetz-abc\x1b[0m')).toBe('quetz-abc');
  });

  it('removes cursor position codes', () => {
    expect(stripAnsi('\x1b[3;1H')).toBe('');
  });

  it('passes through plain text', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

// ── Dimensions ───────────────────────────────────────────────────────────────

describe('rows / cols', () => {
  it('returns a positive number', () => {
    expect(rows()).toBeGreaterThan(0);
    expect(cols()).toBeGreaterThan(0);
  });
});

describe('constants', () => {
  it('HEADER_ROWS is 3, FOOTER_ROWS is 2', () => {
    expect(HEADER_ROWS).toBe(3);
    expect(FOOTER_ROWS).toBe(2);
  });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('enter / exit / isActive', () => {
  it('enter() writes alt screen and hide cursor sequences', () => {
    enter();
    const out = getOutput();
    expect(out).toContain(ANSI.enterAlt);
    expect(out).toContain(ANSI.hideCursor);
    expect(isActive()).toBe(true);
    exit();
  });

  it('exit() writes restore sequences and sets inactive', () => {
    enter();
    stdoutSpy.mockClear();
    exit();
    const out = getOutput();
    expect(out).toContain(ANSI.showCursor);
    expect(out).toContain(ANSI.exitAlt);
    expect(isActive()).toBe(false);
  });

  it('enter() is idempotent — second call is a no-op', () => {
    enter();
    stdoutSpy.mockClear();
    enter();
    expect(stdoutSpy).not.toHaveBeenCalled();
    exit();
  });
});

// ── Layout helpers ────────────────────────────────────────────────────────────

describe('setupScrollRegion', () => {
  it('writes scroll region escape and moves cursor to content area', () => {
    setupScrollRegion();
    const out = getOutput();
    // Should contain the scroll region sequence starting from HEADER_ROWS+1
    expect(out).toContain(`\x1b[${HEADER_ROWS + 1};`);
    expect(out).toContain('r'); // end of scrollRegion sequence
  });
});

describe('clearContentArea', () => {
  it('writes to stdout', () => {
    clearContentArea();
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

// ── writeHeader ───────────────────────────────────────────────────────────────

describe('writeHeader', () => {
  function makeHeader(overrides: Partial<HeaderData> = {}): HeaderData {
    return {
      issueIdStr: 'quetz-abc',
      issueTitle: 'Add auth middleware',
      iteration: 2,
      total: 7,
      elapsed: '3m 42s',
      phase: 'agent',
      ...overrides,
    };
  }

  it('positions cursor at row 1', () => {
    writeHeader(makeHeader());
    expect(getOutput()).toContain(ANSI.move(1, 1));
  });

  it('renders box-drawing border characters', () => {
    writeHeader(makeHeader());
    const out = getOutput();
    expect(out).toContain('╭');
    expect(out).toContain('╮');
    expect(out).toContain('╰');
    expect(out).toContain('╯');
    expect(out).toContain('│');
  });

  it('includes issue ID in header', () => {
    writeHeader(makeHeader({ issueIdStr: 'bd-xyz' }));
    expect(getOutput()).toContain('bd-xyz');
  });

  it('includes phase badge', () => {
    writeHeader(makeHeader({ phase: 'agent' }));
    expect(getOutput()).toContain('AGENT');
  });

  it('includes polling badge for polling phase', () => {
    writeHeader(makeHeader({ phase: 'polling' }));
    expect(getOutput()).toContain('POLLING');
  });

  it('includes MERGED badge for celebration phase', () => {
    writeHeader(makeHeader({ phase: 'celebration' }));
    expect(getOutput()).toContain('MERGED');
  });

  it('includes iteration info', () => {
    writeHeader(makeHeader({ iteration: 3, total: 10 }));
    expect(getOutput()).toContain('3/10');
  });

  it('includes elapsed time', () => {
    writeHeader(makeHeader({ elapsed: '5m 10s' }));
    expect(getOutput()).toContain('5m 10s');
  });

  it('clips long titles', () => {
    const longTitle = 'A'.repeat(60);
    writeHeader(makeHeader({ issueTitle: longTitle }));
    // Output should contain clipped title with ellipsis
    expect(getOutput()).toContain('…');
  });
});

// ── writeFooter ───────────────────────────────────────────────────────────────

describe('writeFooter', () => {
  function makeFooter(overrides: Partial<FooterData> = {}): FooterData {
    return {
      issueIdStr: 'quetz-abc',
      phase: 'agent',
      elapsed: '3m 42s',
      ...overrides,
    };
  }

  it('saves and restores cursor position', () => {
    writeFooter(makeFooter());
    const out = getOutput();
    expect(out).toContain(ANSI.saveCursor);
    expect(out).toContain(ANSI.restoreCursor);
  });

  it('positions at last two rows', () => {
    writeFooter(makeFooter());
    const out = getOutput();
    const r = rows();
    expect(out).toContain(ANSI.move(r - 1, 1));
    expect(out).toContain(ANSI.move(r, 1));
  });

  it('includes separator line', () => {
    writeFooter(makeFooter());
    expect(getOutput()).toContain('─');
  });

  it('includes issue ID in footer', () => {
    writeFooter(makeFooter({ issueIdStr: 'bd-xyz' }));
    expect(getOutput()).toContain('bd-xyz');
  });

  it('includes PR number for polling phase', () => {
    writeFooter(makeFooter({ phase: 'polling', prNumber: 42 }));
    expect(getOutput()).toContain('42');
  });

  it('shows "Agent running…" for agent phase', () => {
    writeFooter(makeFooter({ phase: 'agent' }));
    expect(getOutput()).toContain('Agent running');
  });

  it('shows "Merged ✓" for celebration phase', () => {
    writeFooter(makeFooter({ phase: 'celebration' }));
    expect(getOutput()).toContain('Merged');
  });

  it('shows elapsed time', () => {
    writeFooter(makeFooter({ elapsed: '8m 30s' }));
    expect(getOutput()).toContain('8m 30s');
  });
});

// ── writeCentered ─────────────────────────────────────────────────────────────

describe('writeCentered', () => {
  it('writes each line at the correct row', () => {
    writeCentered(['Line A', 'Line B'], 5);
    const out = getOutput();
    expect(out).toContain(ANSI.move(5, 1));
    expect(out).toContain(ANSI.move(6, 1));
    expect(out).toContain('Line A');
    expect(out).toContain('Line B');
  });
});

// ── writePanel ────────────────────────────────────────────────────────────────

describe('writePanel', () => {
  it('renders rounded corners', () => {
    writePanel(['content line'], 5);
    const out = getOutput();
    expect(out).toContain('╭');
    expect(out).toContain('╮');
    expect(out).toContain('╰');
    expect(out).toContain('╯');
  });

  it('renders content inside panel', () => {
    writePanel(['hello world', 'second line'], 5);
    const out = getOutput();
    expect(out).toContain('hello world');
    expect(out).toContain('second line');
  });

  it('renders vertical borders', () => {
    writePanel(['test'], 5);
    expect(getOutput()).toContain('│');
  });
});
