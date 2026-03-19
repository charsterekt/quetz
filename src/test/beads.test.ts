import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import * as childProcess from 'child_process';
import { getReadyIssues, getIssueDetails, getPrimeContext } from '../beads.js';

const mockExecSync = vi.mocked(childProcess.execSync);
const mockExecFileSync = vi.mocked(childProcess.execFileSync);

afterEach(() => {
  vi.clearAllMocks();
});

describe('getReadyIssues', () => {
  it('returns parsed array', () => {
    const issues = [{ id: 'bd-001', title: 'Fix bug', status: 'open', priority: 1 }];
    mockExecSync.mockReturnValue(JSON.stringify(issues) as never);
    const result = getReadyIssues();
    expect(result).toEqual(issues);
    expect(mockExecSync).toHaveBeenCalledWith('bd ready --json', expect.any(Object));
  });

  it('returns empty array for empty response', () => {
    mockExecSync.mockReturnValue('[]' as never);
    expect(getReadyIssues()).toEqual([]);
  });

  it('returns empty array when result is not an array', () => {
    mockExecSync.mockReturnValue('{}' as never);
    expect(getReadyIssues()).toEqual([]);
  });

  it('throws on bd failure', () => {
    mockExecSync.mockImplementation(() => { throw new Error('bd not found'); });
    expect(() => getReadyIssues()).toThrow('bd command failed');
  });
});

describe('getIssueDetails', () => {
  it('returns parsed issue', () => {
    const issue = { id: 'bd-001', title: 'Fix bug', description: 'Details', status: 'open', priority: 1, issue_type: 'bug', created_at: '', updated_at: '' };
    mockExecFileSync.mockReturnValue(JSON.stringify(issue) as never);
    const result = getIssueDetails('bd-001');
    expect(result.id).toBe('bd-001');
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['show', 'bd-001', '--json'], expect.any(Object));
  });

  it('throws descriptively on failure', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
    expect(() => getIssueDetails('bd-999')).toThrow('bd command failed');
  });

  it('rejects invalid issue ID format to prevent injection', () => {
    expect(() => getIssueDetails('bd-001; rm -rf /')).toThrow('Invalid issue ID format');
    expect(() => getIssueDetails('bd-001 && echo hacked')).toThrow('Invalid issue ID format');
    expect(() => getIssueDetails('bd-001$(cat /etc/passwd)')).toThrow('Invalid issue ID format');
  });
});

describe('getPrimeContext', () => {
  it('returns prime output', () => {
    mockExecSync.mockReturnValue('# Project context\n...' as never);
    expect(getPrimeContext()).toBe('# Project context\n...');
  });

  it('returns empty string on failure', () => {
    mockExecSync.mockImplementation(() => { throw new Error('bd prime failed'); });
    expect(getPrimeContext()).toBe('');
  });
});
