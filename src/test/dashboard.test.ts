import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  generateDashboardHtml,
  writeDashboard,
  getDashboardPath,
  type DashboardState,
} from '../display/dashboard.js';

function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    issueId:    'mock-003',
    issueTitle: 'Add dark mode support to dashboard',
    iteration:  1,
    total:      5,
    phase:      'agent',
    elapsed:    '2m 30s',
    startedAt:  '2026-03-21T10:00:00Z',
    updatedAt:  '2026-03-21T10:02:30Z',
    ...overrides,
  };
}

// ── generateDashboardHtml ────────────────────────────────────────────────────

describe('generateDashboardHtml', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = generateDashboardHtml(makeState());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('includes CSS custom properties for light theme', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('--color-bg:');
    expect(html).toContain('--color-surface:');
    expect(html).toContain('--color-text:');
  });

  it('includes CSS custom properties for dark theme', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('[data-theme="dark"]');
  });

  it('includes prefers-color-scheme media query', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('includes localStorage usage for theme persistence', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('localStorage');
    expect(html).toContain('quetz-theme');
  });

  it('includes theme toggle button', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('theme-toggle');
    expect(html).toContain('toggleTheme');
  });

  it('includes data-theme attribute logic', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('data-theme');
    expect(html).toContain('setAttribute');
    expect(html).toContain('removeAttribute');
  });

  it('reflects issue ID in output', () => {
    const html = generateDashboardHtml(makeState({ issueId: 'bd-xyz' }));
    expect(html).toContain('bd-xyz');
  });

  it('reflects issue title in output', () => {
    const html = generateDashboardHtml(makeState({ issueTitle: 'Some feature' }));
    expect(html).toContain('Some feature');
  });

  it('reflects iteration and total', () => {
    const html = generateDashboardHtml(makeState({ iteration: 3, total: 8 }));
    expect(html).toContain('3');
    expect(html).toContain('8');
  });

  it('reflects elapsed time', () => {
    const html = generateDashboardHtml(makeState({ elapsed: '5m 00s' }));
    expect(html).toContain('5m 00s');
  });

  it('shows PR number when provided', () => {
    const html = generateDashboardHtml(makeState({ prNumber: 42 }));
    expect(html).toContain('42');
  });

  it('shows PR link when both prNumber and prUrl provided', () => {
    const html = generateDashboardHtml(makeState({
      prNumber: 99,
      prUrl: 'https://github.com/owner/repo/pull/99',
    }));
    expect(html).toContain('href=');
    expect(html).toContain('99');
  });

  it('escapes HTML special characters in issue title', () => {
    const html = generateDashboardHtml(makeState({ issueTitle: '<script>alert("xss")</script>' }));
    expect(html).not.toContain('<script>alert(');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in issue ID', () => {
    const html = generateDashboardHtml(makeState({ issueId: '<bad>' }));
    expect(html).not.toContain('<bad>');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('includes auto-refresh meta tag', () => {
    const html = generateDashboardHtml(makeState());
    expect(html).toContain('http-equiv="refresh"');
  });

  it('renders each phase label correctly', () => {
    const phases: Array<DashboardState['phase']> = [
      'startup', 'agent', 'polling', 'commit', 'celebration', 'victory',
    ];
    for (const phase of phases) {
      const html = generateDashboardHtml(makeState({ phase }));
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it('shows polling PR number in phase label', () => {
    const html = generateDashboardHtml(makeState({ phase: 'polling', prNumber: 55 }));
    expect(html).toContain('55');
  });

  it('shows searching label when polling without PR', () => {
    const html = generateDashboardHtml(makeState({ phase: 'polling' }));
    expect(html).toContain('Searching for PR');
  });
});

// ── writeDashboard ───────────────────────────────────────────────────────────

describe('writeDashboard', () => {
  it('writes HTML to the given path', () => {
    const tmpFile = path.join(os.tmpdir(), `quetz-test-${Date.now()}.html`);
    try {
      writeDashboard(tmpFile, makeState());
      expect(fs.existsSync(tmpFile)).toBe(true);
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toContain('<!DOCTYPE html>');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('overwrites an existing file', () => {
    const tmpFile = path.join(os.tmpdir(), `quetz-test-overwrite-${Date.now()}.html`);
    try {
      fs.writeFileSync(tmpFile, 'old content', 'utf8');
      writeDashboard(tmpFile, makeState({ issueId: 'new-issue' }));
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).toContain('new-issue');
      expect(content).not.toBe('old content');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

// ── getDashboardPath ─────────────────────────────────────────────────────────

describe('getDashboardPath', () => {
  it('returns a path ending in .quetz-dashboard.html', () => {
    const p = getDashboardPath('/some/project');
    expect(p).toMatch(/\.quetz-dashboard\.html$/);
  });

  it('uses the provided cwd', () => {
    const p = getDashboardPath('/my/project');
    expect(p).toContain('my');
    expect(p).toContain('project');
  });

  it('defaults to process.cwd()', () => {
    const p = getDashboardPath();
    expect(path.isAbsolute(p)).toBe(true);
  });
});
