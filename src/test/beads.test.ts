import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import * as childProcess from 'child_process';
import { getReadyIssues, getIssueDetails, getPrimeContext, listAllIssues, enableMockMode, disableMockMode } from '../beads.js';
import { MOCK_ISSUES } from '../mock-data.js';

const mockExecSync = vi.mocked(childProcess.execSync);
const mockExecFileSync = vi.mocked(childProcess.execFileSync);

afterEach(() => {
  vi.clearAllMocks();
  disableMockMode();
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

describe('mock mode', () => {
  it('getReadyIssues returns only ready mock issues without calling bd', () => {
    enableMockMode();
    const result = getReadyIssues();
    expect(mockExecSync).not.toHaveBeenCalled();
    expect(result.every(i => i.status === 'ready')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('listAllIssues returns all mock issues including non-ready ones', () => {
    enableMockMode();
    const result = listAllIssues();
    expect(mockExecSync).not.toHaveBeenCalled();
    expect(result).toEqual(MOCK_ISSUES);
    const statuses = result.map(i => i.status);
    expect(statuses).toContain('ready');
    expect(statuses).toContain('in_progress');
    expect(statuses).toContain('closed');
  });

  it('getIssueDetails finds mock issue by id without calling bd', () => {
    enableMockMode();
    const issue = getIssueDetails('mock-001');
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(issue.id).toBe('mock-001');
    expect(issue.title).toBeTruthy();
  });

  it('getIssueDetails throws when mock id not found', () => {
    enableMockMode();
    expect(() => getIssueDetails('mock-999')).toThrow('Mock issue not found');
  });

  it('disableMockMode restores bd calls', () => {
    enableMockMode();
    disableMockMode();
    mockExecSync.mockReturnValue('[]' as never);
    getReadyIssues();
    expect(mockExecSync).toHaveBeenCalledWith('bd ready --json', expect.any(Object));
  });
});
