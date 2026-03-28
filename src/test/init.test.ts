import { describe, expect, it } from 'vitest';

import { formatPreflightChecklist } from '../init.js';
import type { PreflightResult } from '../preflight.js';

function buildPreflightResult(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    owner: 'acme',
    repo: 'quetz',
    defaultBranch: 'main',
    preferredProvider: 'codex',
    providerStatuses: [
      {
        provider: 'claude',
        installed: true,
        authenticated: false,
        runtimeImplemented: true,
        warnings: ['Claude Code is installed but not authenticated.'],
      },
      {
        provider: 'codex',
        installed: true,
        authenticated: true,
        runtimeImplemented: true,
        warnings: [],
      },
    ],
    ...overrides,
  };
}

describe('formatPreflightChecklist', () => {
  it('renders explicit checklist lines for shared tooling and providers', () => {
    const lines = formatPreflightChecklist(buildPreflightResult());

    expect(lines).toContain('  ✓  GitHub CLI authenticated');
    expect(lines).toContain('  ✓  Beads CLI ready');
    expect(lines).toContain('  ✓  Git remote origin -> acme/quetz (main)');
    expect(lines).toContain('  ✗  Claude Code: installed, not authenticated');
    expect(lines).toContain('  ✓  Codex CLI: ready (selected)');
  });

  it('marks unavailable provider CLIs with a cross', () => {
    const lines = formatPreflightChecklist(buildPreflightResult({
      preferredProvider: 'claude',
      providerStatuses: [
        {
          provider: 'claude',
          installed: true,
          authenticated: true,
          runtimeImplemented: true,
          warnings: [],
        },
        {
          provider: 'codex',
          installed: false,
          authenticated: false,
          runtimeImplemented: true,
          warnings: [],
        },
      ],
    }));

    expect(lines).toContain('  ✓  Claude Code: ready (selected)');
    expect(lines).toContain('  ✗  Codex CLI: CLI not found');
  });
});
