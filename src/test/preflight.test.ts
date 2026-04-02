import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn() };
});
vi.mock('../git.js', () => ({
  getRemoteUrl: vi.fn(() => 'https://github.com/owner/repo.git'),
  parseOwnerRepo: vi.fn(() => ({ owner: 'owner', repo: 'repo' })),
  getDefaultBranch: vi.fn(() => 'main'),
}));

import { execSync } from 'child_process';
import * as fs from 'fs';
import { PreflightError, claudeAuthTokenExists, runPreflight } from '../preflight.js';

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(fs.existsSync);

function normalizePath(target: fs.PathLike): string {
  return String(target).replace(/\\/g, '/');
}

let originalApiKey: string | undefined;
let originalAuthToken: string | undefined;
let originalOpenAiApiKey: string | undefined;
let originalCodexApiKey: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalApiKey = process.env['ANTHROPIC_API_KEY'];
  originalAuthToken = process.env['ANTHROPIC_AUTH_TOKEN'];
  originalOpenAiApiKey = process.env['OPENAI_API_KEY'];
  originalCodexApiKey = process.env['CODEX_API_KEY'];
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['ANTHROPIC_AUTH_TOKEN'];
  delete process.env['OPENAI_API_KEY'];
  delete process.env['CODEX_API_KEY'];
});

afterEach(() => {
  if (originalApiKey !== undefined) {
    process.env['ANTHROPIC_API_KEY'] = originalApiKey;
  } else {
    delete process.env['ANTHROPIC_API_KEY'];
  }
  if (originalAuthToken !== undefined) {
    process.env['ANTHROPIC_AUTH_TOKEN'] = originalAuthToken;
  } else {
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
  }
  if (originalOpenAiApiKey !== undefined) {
    process.env['OPENAI_API_KEY'] = originalOpenAiApiKey;
  } else {
    delete process.env['OPENAI_API_KEY'];
  }
  if (originalCodexApiKey !== undefined) {
    process.env['CODEX_API_KEY'] = originalCodexApiKey;
  } else {
    delete process.env['CODEX_API_KEY'];
  }
});

describe('claudeAuthTokenExists', () => {
  it('returns true when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
    mockExistsSync.mockReturnValue(false);
    expect(claudeAuthTokenExists()).toBe(true);
  });

  it('returns true when ANTHROPIC_AUTH_TOKEN is set', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'oauth-token';
    mockExistsSync.mockReturnValue(false);
    expect(claudeAuthTokenExists()).toBe(true);
  });

  it('returns true when credentials file exists', () => {
    mockExistsSync.mockReturnValue(true);
    expect(claudeAuthTokenExists()).toBe(true);
  });

  it('returns false when neither API key nor credentials file is present', () => {
    mockExistsSync.mockReturnValue(false);
    expect(claudeAuthTokenExists()).toBe(false);
  });
});

describe('checkClaudeCode (via runPreflight)', () => {
  beforeEach(() => {
    // Make gh, bd, and git checks pass by default
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes('gh --version')) return 'gh version 2.0.0\n';
      if (String(cmd).includes('gh auth status')) return 'Logged in\n';
      if (String(cmd).includes('bd --version')) return 'bd 1.0.0\n';
      if (String(cmd).includes('bd ready')) return '[]\n';
      if (String(cmd).includes('claude --version')) return 'claude 1.0.0\n';
      if (String(cmd).includes('codex --version')) return 'codex 1.0.0\n';
      return '';
    });
  });

  it('throws PreflightError when claude is not installed', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes('claude --version')) throw new Error('not found');
      if (String(cmd).includes('gh --version')) return 'gh version 2.0.0\n';
      if (String(cmd).includes('gh auth status')) return 'Logged in\n';
      if (String(cmd).includes('bd --version')) return 'bd 1.0.0\n';
      if (String(cmd).includes('bd ready')) return '[]\n';
      return '';
    });
    mockExistsSync.mockReturnValue(false);

    expect(() => runPreflight()).toThrow(PreflightError);
    expect(() => runPreflight()).toThrow(/runtime unavailable/i);
  });

  it('throws PreflightError when claude is installed but no auth token exists', async () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => runPreflight()).toThrow(PreflightError);
    expect(() => runPreflight()).toThrow(/Claude Code is installed but not authenticated/i);
  });

  it('passes when ANTHROPIC_API_KEY is set (no credentials file needed)', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    mockExistsSync.mockReturnValue(false);

    expect(() => runPreflight()).not.toThrow();
  });

  it('passes when credentials file exists (no API key needed)', async () => {
    mockExistsSync.mockReturnValue(true);

    expect(() => runPreflight()).not.toThrow();
  });

  it('accepts Codex auth from ~/.codex/auth.json when explicitly selected', () => {
    mockExistsSync.mockImplementation((target: fs.PathLike) => {
      const normalized = normalizePath(target);
      return normalized.includes('@openai/codex-sdk') || normalized.includes('.codex/auth.json');
    });
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes('gh --version')) return 'gh version 2.0.0\n';
      if (String(cmd).includes('gh auth status')) return 'Logged in\n';
      if (String(cmd).includes('bd --version')) return 'bd 1.0.0\n';
      if (String(cmd).includes('bd ready')) return '[]\n';
      if (String(cmd).includes('claude --version')) throw new Error('not found');
      if (String(cmd).includes('codex --version')) return 'codex 1.0.0\n';
      return '';
    });

    const result = runPreflight('codex');
    expect(result.preferredProvider).toBe('codex');
  });

  it('does not run claude --print inference command', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    mockExistsSync.mockReturnValue(false);

    runPreflight();

    const claudeCalls = mockExecSync.mock.calls
      .map(call => String(call[0]))
      .filter(cmd => cmd.includes('claude'));
    expect(claudeCalls.every(cmd => !cmd.includes('--print'))).toBe(true);
  });

  it('accepts Codex as the selected provider when installed and authenticated', () => {
    process.env['OPENAI_API_KEY'] = 'sk-openai-test';
    mockExistsSync.mockImplementation((target: fs.PathLike) =>
      normalizePath(target).includes('@openai/codex-sdk')
    );
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes('gh --version')) return 'gh version 2.0.0\n';
      if (String(cmd).includes('gh auth status')) return 'Logged in\n';
      if (String(cmd).includes('bd --version')) return 'bd 1.0.0\n';
      if (String(cmd).includes('bd ready')) return '[]\n';
      if (String(cmd).includes('claude --version')) throw new Error('not found');
      if (String(cmd).includes('codex --version')) return 'codex 1.0.0\n';
      return '';
    });

    const result = runPreflight('codex');
    expect(result.preferredProvider).toBe('codex');
  });

  it('reports installed unauthenticated Codex instead of asking for Claude when Claude is absent', () => {
    mockExistsSync.mockImplementation((target: fs.PathLike) =>
      normalizePath(target).includes('@openai/codex-sdk')
    );
    mockExecSync.mockImplementation((cmd: string) => {
      if (String(cmd).includes('gh --version')) return 'gh version 2.0.0\n';
      if (String(cmd).includes('gh auth status')) return 'Logged in\n';
      if (String(cmd).includes('bd --version')) return 'bd 1.0.0\n';
      if (String(cmd).includes('bd ready')) return '[]\n';
      if (String(cmd).includes('claude --version')) throw new Error('not found');
      if (String(cmd).includes('codex --version')) return 'codex 1.0.0\n';
      return '';
    });

    expect(() => runPreflight()).toThrow(/Installed but unauthenticated: Codex SDK/i);
  });
});
