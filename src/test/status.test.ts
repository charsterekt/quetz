import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock terminal helpers to return plain text
vi.mock('../display/terminal.js', () => ({
  brand: (t: string) => t,
  issueId: (t: string) => t,
  success: (t: string) => t,
  waiting: (t: string) => t,
  error: (t: string) => t,
  dim: (t: string) => t,
  separator: (t: string) => t,
  chrome: (t: string) => t,
}));

import { formatStatusLine, formatElapsed, updateStatusLine, clearStatusLine, type StatusState } from '../display/status.js';

let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
});

describe('formatStatusLine', () => {
  it('formats agent phase', () => {
    const state: StatusState = {
      iteration: 3,
      total: 14,
      issueIdStr: 'bd-c3d4',
      phase: 'agent',
      elapsed: '4m 12s',
    };
    const line = formatStatusLine(state);
    expect(line).toContain('[quetz]');
    expect(line).toContain('Issue 3/14');
    expect(line).toContain('bd-c3d4');
    expect(line).toContain('Agent running...');
    expect(line).toContain('4m 12s');
  });

  it('formats polling phase with PR number', () => {
    const state: StatusState = {
      iteration: 3,
      total: 14,
      issueIdStr: 'bd-c3d4',
      phase: 'polling',
      elapsed: '1m 05s',
      prNumber: 42,
    };
    const line = formatStatusLine(state);
    expect(line).toContain('PR #42');
    expect(line).toContain('waiting for merge');
    expect(line).toContain('1m 05s');
  });

  it('formats polling phase without PR number', () => {
    const state: StatusState = {
      iteration: 1,
      total: 5,
      issueIdStr: 'bd-xyz',
      phase: 'polling',
      elapsed: '0m 30s',
    };
    const line = formatStatusLine(state);
    expect(line).toContain('waiting for merge');
    expect(line).not.toContain('PR #');
  });
});

describe('formatElapsed', () => {
  it('formats 0 ms', () => {
    expect(formatElapsed(0)).toBe('0m 00s');
  });

  it('formats seconds only', () => {
    expect(formatElapsed(45_000)).toBe('0m 45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(252_000)).toBe('4m 12s');
  });

  it('pads single-digit seconds', () => {
    expect(formatElapsed(65_000)).toBe('1m 05s');
  });
});

describe('updateStatusLine', () => {
  it('writes to stdout with carriage return', () => {
    updateStatusLine({
      iteration: 1,
      total: 10,
      issueIdStr: 'bd-abc',
      phase: 'agent',
      elapsed: '0m 05s',
    });
    expect(stdoutSpy).toHaveBeenCalled();
    const output = String(stdoutSpy.mock.calls[0][0]);
    expect(output).toContain('\r');
  });
});

describe('clearStatusLine', () => {
  it('clears the line after an update', () => {
    updateStatusLine({
      iteration: 1,
      total: 10,
      issueIdStr: 'bd-abc',
      phase: 'agent',
      elapsed: '0m 05s',
    });
    clearStatusLine();
    // Should have written a clearing line
    const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1];
    const output = String(lastCall[0]);
    expect(output).toContain('\r');
  });
});
