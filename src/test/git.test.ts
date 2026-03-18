import { describe, it, expect } from 'vitest';
import { parseOwnerRepo } from '../git.js';

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
