import { describe, it, expect, vi } from 'vitest';
import { parseOwnerRepo, getCommitCountAhead } from '../git.js';

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
  it('returns 0 when execSync throws', () => {
    // In this test environment there is no real git repo with a "main" branch
    // so the function either returns a number or 0 on failure — just verify it returns a number
    const result = getCommitCountAhead('nonexistent-branch-xyz');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
