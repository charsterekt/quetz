import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../prompt.js';
import type { BeadsIssue } from '../beads.js';
import type { QuetzConfig } from '../config.js';

const baseConfig: QuetzConfig = {
  github: { owner: 'acme', repo: 'myapp', defaultBranch: 'main', automergeLabel: 'automerge' },
  agent: { timeout: 30 },
  poll: { interval: 30, mergeTimeout: 15, prDetectionTimeout: 60 },
  display: { animations: false, colors: false },
};

const baseIssue: BeadsIssue = {
  id: 'quetz-abc',
  title: 'Add auth middleware',
  description: 'Implement JWT auth.',
  status: 'open',
  priority: 1,
  issue_type: 'feature',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('assemblePrompt', () => {
  it('includes issue id, title, priority, and type', () => {
    const prompt = assemblePrompt(baseIssue, '', baseConfig);
    expect(prompt).toContain('quetz-abc');
    expect(prompt).toContain('Add auth middleware');
    expect(prompt).toContain('1');
    expect(prompt).toContain('feature');
  });

  it('includes description when present', () => {
    const prompt = assemblePrompt(baseIssue, '', baseConfig);
    expect(prompt).toContain('Implement JWT auth.');
  });

  it('includes bdPrime context', () => {
    const prompt = assemblePrompt(baseIssue, '# Project context', baseConfig);
    expect(prompt).toContain('# Project context');
  });

  it('includes automerge label', () => {
    const prompt = assemblePrompt(baseIssue, '', baseConfig);
    expect(prompt).toContain('automerge');
  });

  it('omits description block when description is empty', () => {
    const issue = { ...baseIssue, description: '' };
    const prompt = assemblePrompt(issue, '', baseConfig);
    expect(prompt).not.toContain('Description:');
  });

  it('includes dependencies when present', () => {
    const issue: BeadsIssue = {
      ...baseIssue,
      dependencies: [
        { issue_id: 'quetz-abc', depends_on_id: 'quetz-xyz', type: 'blocks' },
      ],
    };
    const prompt = assemblePrompt(issue, '', baseConfig);
    expect(prompt).toContain('quetz-xyz');
  });

  it('uses custom prompt template from config', () => {
    const config = { ...baseConfig, agent: { timeout: 30, prompt: 'Custom: {{issue.id}}' } };
    const prompt = assemblePrompt(baseIssue, '', config);
    expect(prompt).toBe('Custom: quetz-abc');
  });
});
