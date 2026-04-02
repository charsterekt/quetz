import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

import { execSync } from 'child_process';
import { parseOwnerRepo, getCommitCountAhead } from '../git.js';

const mockExecSync = vi.mocked(execSync);

describe('parseOwnerRepo', () => {
  it('parses HTTPS URL', () => {
    expect(parseOwnerRepo('https://github.com/dk/aegis.git')).toEqual({ owner: 'dk', repo: 'aegis' });
  });

  it('parses HTTPS URL without .git suffix', () => {
    expect(parseOwnerRepo('https://github.com/myorg/myrepo')).toEqual({ owner: 'myorg', repo: 'myrepo' });
  });

  it('parses SSH URL', () => {
    expect(parseOwnerRepo('git@github.com:charsterekt/quetz.git')).toEqual({
      owner: 'charsterekt',
      repo: 'quetz',
    });
  });

  it('throws on non-GitHub URL', () => {
    expect(() => parseOwnerRepo('https://gitlab.com/owner/repo.git')).toThrow();
  });
});

describe('getCommitCountAhead', () => {
  it('returns the parsed commit count when git succeeds', () => {
    mockExecSync.mockReturnValueOnce('3');

    expect(getCommitCountAhead('main')).toBe(3);
    expect(mockExecSync).toHaveBeenCalledWith(
      'git rev-list --count main..HEAD',
      expect.objectContaining({ encoding: 'utf-8', stdio: 'pipe' })
    );
  });

  it('returns 0 when execSync throws', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('fatal: ambiguous argument');
    });

    const result = getCommitCountAhead('nonexistent-branch-xyz');
    expect(typeof result).toBe('number');
    expect(result).toBe(0);
  });
});
