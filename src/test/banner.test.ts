import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock terminal helpers to return plain text
vi.mock('../display/terminal.js', () => ({
  brand: (t: string) => t,
  dim: (t: string) => t,
  chrome: (t: string) => t,
}));

// Mock tui to avoid alt-screen side effects and provide ANSI helpers
vi.mock('../display/tui.js', () => ({
  ANSI: {
    move: (row: number, col: number) => `\x1b[${row};${col}H`,
    clearEol: '\x1b[K',
  },
  cols: () => 80,
  rows: () => 24,
  writeCentered: vi.fn((lines: string[], startRow: number) => {
    for (let i = 0; i < lines.length; i++) {
      process.stdout.write(`\x1b[${startRow + i};1H${lines[i]}`);
    }
  }),
}));

import {
  getUsageBanner,
  printUsageBanner,
  getSerpentArt,
  printSerpentStatic,
  printSerpentAnimated,
  printHelp,
} from '../display/banner.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

function getOutput(): string {
  return stdoutSpy.mock.calls.map((c: Parameters<typeof process.stdout.write>) => String(c[0])).join('');
}

describe('getUsageBanner', () => {
  it('returns the boxed command reference', () => {
    const banner = getUsageBanner();
    expect(banner).toContain('QUETZ');
    expect(banner).toContain('Feathered Serpent');
    expect(banner).toContain('init');
    expect(banner).toContain('run');
    expect(banner).toContain('status');
    expect(banner).toContain('help');
    expect(banner).toContain('╔');
    expect(banner).toContain('╚');
  });
});

describe('printUsageBanner', () => {
  it('writes banner to stdout', () => {
    printUsageBanner();
    const out = getOutput();
    expect(out).toContain('QUETZ');
    expect(out).toContain('╔');
  });
});

describe('getSerpentArt', () => {
  it('returns ASCII serpent with version and tagline', () => {
    const art = getSerpentArt();
    expect(art).toContain('≋');
    expect(art).toContain('Q U E T Z');
    expect(art).toContain('Feathered Serpent Dev Loop');
  });

  it('returns multi-line art', () => {
    const art = getSerpentArt();
    expect(art.split('\n').length).toBeGreaterThan(5);
  });
});

describe('printSerpentStatic', () => {
  it('writes serpent art to stdout', () => {
    printSerpentStatic();
    const out = getOutput();
    expect(out).toContain('≋');
    expect(out).toContain('Feathered Serpent Dev Loop');
  });
});

describe('printSerpentAnimated', () => {
  it('prints static art when animate is false', async () => {
    await printSerpentAnimated(false);
    const out = getOutput();
    expect(out).toContain('Feathered Serpent Dev Loop');
    // No cursor-up animation sequences expected
    expect(out).not.toContain('\x1b[7A');
  });

  it('prints animated frames when animate is true', async () => {
    vi.useFakeTimers();
    const promise = printSerpentAnimated(true);
    // Advance through all animation frames (14 frames × 60ms + 800ms pause)
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }
    await promise;
    vi.useRealTimers();

    const out = getOutput();
    // Animation uses ANSI.move() sequences for absolute positioning
    expect(out).toContain('\x1b[');
    // Final frame should show the full art
    expect(out).toContain('Feathered Serpent Dev Loop');
  });
});

describe('printHelp', () => {
  it('prints usage banner and command descriptions', () => {
    printHelp();
    const out = getOutput();
    expect(out).toContain('QUETZ');
    expect(out).toContain('Commands:');
    expect(out).toContain('quetz init');
    expect(out).toContain('quetz run');
    expect(out).toContain('--dry');
    expect(out).toContain('--model');
    expect(out).toContain('--timeout');
    expect(out).toContain('quetz status');
    expect(out).toContain('quetz help');
  });
});
