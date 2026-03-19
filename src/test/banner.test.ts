import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock terminal helpers to return plain text
vi.mock('../display/terminal.js', () => ({
  brand: (t: string) => t,
  dim: (t: string) => t,
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
    expect(art).toContain('~~~');
    expect(art).toContain('QUETZ v0.1.0');
    expect(art).toContain('Feathered Serpent Dev Loop');
  });
});

describe('printSerpentStatic', () => {
  it('writes serpent art to stdout', () => {
    printSerpentStatic();
    const out = getOutput();
    expect(out).toContain('~~~');
    expect(out).toContain('QUETZ v0.1.0');
  });
});

describe('printSerpentAnimated', () => {
  it('prints static art when animate is false', async () => {
    await printSerpentAnimated(false);
    const out = getOutput();
    expect(out).toContain('QUETZ v0.1.0');
    expect(out).toContain('Feathered Serpent Dev Loop');
    // Should NOT contain ANSI cursor-up sequences (no animation)
    expect(out).not.toContain('\x1b[7A');
  });

  it('prints animated frames when animate is true', async () => {
    // Use fake timers to avoid waiting ~1s
    vi.useFakeTimers();
    const promise = printSerpentAnimated(true);
    // Advance through all animation frames
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }
    await promise;
    vi.useRealTimers();

    const out = getOutput();
    // Should contain ANSI cursor-up escape for frame overwriting
    expect(out).toContain('\x1b[7A');
    // Final frame should show the full art
    expect(out).toContain('QUETZ v0.1.0');
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
    expect(out).toContain('quetz run --dry');
    expect(out).toContain('quetz status');
    expect(out).toContain('quetz help');
  });
});
