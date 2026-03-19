import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chalk to return plain text so we can assert content without ANSI codes
vi.mock('chalk', () => {
  const identity = (t: string) => t;
  const fn = Object.assign(identity, {
    green: Object.assign(identity, { bold: identity }),
    cyan: Object.assign(identity, { bold: identity }),
    red: Object.assign(identity, { bold: identity }),
    yellow: identity,
    gray: identity,
    magenta: identity,
  });
  return { default: fn };
});

import { brand, issueId, success, waiting, error, dim, separator, setColorsEnabled, getTerminalWidth, wipeTransition } from '../display/terminal.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

describe('colour helpers', () => {
  it('returns text through each helper', () => {
    expect(brand('hello')).toBe('hello');
    expect(issueId('quetz-abc')).toBe('quetz-abc');
    expect(success('ok')).toBe('ok');
    expect(waiting('wait')).toBe('wait');
    expect(error('fail')).toBe('fail');
    expect(dim('info')).toBe('info');
    expect(separator('---')).toBe('---');
  });

  it('returns plain text when colors disabled', () => {
    setColorsEnabled(false);
    expect(brand('hello')).toBe('hello');
    expect(error('fail')).toBe('fail');
    setColorsEnabled(true);
  });
});

describe('getTerminalWidth', () => {
  it('returns process.stdout.columns or fallback 80', () => {
    const width = getTerminalWidth();
    expect(typeof width).toBe('number');
    expect(width).toBeGreaterThan(0);
  });
});

describe('wipeTransition', () => {
  it('writes a line of dashes to stdout', () => {
    wipeTransition();
    expect(stdoutSpy).toHaveBeenCalled();
    const output = String(stdoutSpy.mock.calls[0][0]);
    expect(output).toContain('─');
    expect(output).toContain('\n');
  });
});
