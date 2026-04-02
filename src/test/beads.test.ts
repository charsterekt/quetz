import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import * as childProcess from 'child_process';
import {
  assertEpicIssue,
  countOpenIssues,
  getDependencyCycles,
  getEpicScopeSummary,
  getReadyIssues,
  getIssueDetails,
  getPrimeContext,
  listScopedIssues,
  listAllIssues,
  validateEpicGraph,
  type BeadsScope,
  enableMockMode,
  disableMockMode,
} from '../beads.js';
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
    mockExecFileSync.mockReturnValue(JSON.stringify(issues) as never);
    const result = getReadyIssues();
    expect(result).toEqual(issues);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['ready', '--json'], expect.any(Object));
  });

  it('returns empty array for empty response', () => {
    mockExecFileSync.mockReturnValue('[]' as never);
    expect(getReadyIssues()).toEqual([]);
  });

  it('returns empty array when result is not an array', () => {
    mockExecFileSync.mockReturnValue('{}' as never);
    expect(getReadyIssues()).toEqual([]);
  });

  it('throws on bd failure', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('bd not found'); });
    expect(() => getReadyIssues()).toThrow('bd command failed');
  });

  it('uses bd ready --parent for epic scope', () => {
    const scope: BeadsScope = { mode: 'epic', epicId: 'quetz-a0p' };
    mockExecFileSync.mockReturnValue('[]' as never);
    expect(getReadyIssues(scope)).toEqual([]);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['ready', '--parent', 'quetz-a0p', '--json'], expect.any(Object));
  });
});

describe('listScopedIssues', () => {
  it('returns scoped issues from bd list for epic scope', () => {
    const scope: BeadsScope = { mode: 'epic', epicId: 'quetz-a0p' };
    const issues = [
      { id: 'quetz-1', status: 'open' },
      { id: 'quetz-2', status: 'closed' },
    ];
    mockExecFileSync.mockReturnValue(JSON.stringify(issues) as never);

    expect(listScopedIssues(scope)).toEqual(issues);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['list', '--parent', 'quetz-a0p', '--all', '--flat', '--json'], expect.any(Object));
  });

  it('surfaces the exact bd command when JSON parsing fails', () => {
    mockExecFileSync.mockReturnValue('not-json' as never);
    expect(() => listScopedIssues()).toThrow('bd command failed: bd list --all --flat --json');
  });
});

describe('countOpenIssues', () => {
  it('returns the parsed open-issue count', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([
      { id: 'bd-001', status: 'open' },
      { id: 'bd-002', status: 'ready' },
      { id: 'bd-003', status: 'closed' },
    ]) as never);
    expect(countOpenIssues()).toBe(2);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['list', '--all', '--flat', '--json'], expect.any(Object));
  });

  it('returns open-like mock issue count in mock mode', () => {
    enableMockMode();
    expect(countOpenIssues()).toBe(4);
    expect(mockExecFileSync).not.toHaveBeenCalled();
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

describe('dependency validation', () => {
  it('returns dependency cycles from bd dep cycles', () => {
    const cycles = [{ issues: ['bd-1', 'bd-2'] }];
    mockExecFileSync.mockReturnValue(JSON.stringify(cycles) as never);

    expect(getDependencyCycles()).toEqual(cycles);
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['dep', 'cycles', '--json'], expect.any(Object));
  });

  it('parses swarm validation output into errors warnings and info', () => {
    mockExecSync.mockReturnValue([
      'warning: child bd-2 is blocked',
      'Ready fronts: 2',
      'error: cycle detected',
    ].join('\n') as never);

    expect(validateEpicGraph('quetz-a0p')).toEqual({
      errors: ['error: cycle detected'],
      warnings: ['warning: child bd-2 is blocked'],
      info: ['Ready fronts: 2'],
    });
    expect(mockExecSync).toHaveBeenCalledWith('bd swarm validate quetz-a0p', expect.any(Object));
  });

  it('throws with the exact bd swarm validate command when validation output is malformed', () => {
    mockExecSync.mockReturnValue('   ' as never);
    expect(() => validateEpicGraph('quetz-a0p')).toThrow('bd command failed: bd swarm validate quetz-a0p');
  });
});

describe('epic validation helpers', () => {
  it('asserts epic issues and includes the failing bd show command in errors', () => {
    expect(() => assertEpicIssue({
      id: 'quetz-a0p',
      title: 'Some task',
      description: '',
      status: 'open',
      priority: 1,
      issue_type: 'task',
      created_at: '',
      updated_at: '',
    }, 'quetz-a0p')).toThrow('bd show quetz-a0p --json');
  });
});

describe('epic summary', () => {
  it('returns swarm status counts mapped from bd swarm status', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify({
      completed: 4,
      active: 2,
      ready: 3,
      blocked: 1,
    }) as never);

    expect(getEpicScopeSummary('quetz-a0p')).toEqual({
      done: 4,
      active: 2,
      ready: 3,
      blocked: 1,
    });
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['swarm', 'status', 'quetz-a0p', '--json'], expect.any(Object));
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
    expect(mockExecFileSync).not.toHaveBeenCalled();
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
    mockExecFileSync.mockReturnValue('[]' as never);
    getReadyIssues();
    expect(mockExecFileSync).toHaveBeenCalledWith('bd', ['ready', '--json'], expect.any(Object));
  });
});
