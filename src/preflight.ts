import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getRemoteUrl, parseOwnerRepo, getDefaultBranch } from './git.js';

export interface PreflightResult {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export class PreflightError extends Error {
  readonly exitCode = 3;
  constructor(message: string) {
    super(message);
    this.name = 'PreflightError';
  }
}

function tryExec(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return { ok: true, output: output.trim() };
  } catch (err) {
    const msg = (err as { stderr?: Buffer | string; message?: string }).stderr?.toString()
      ?? (err as Error).message
      ?? '';
    return { ok: false, output: msg };
  }
}

/**
 * Returns true if a Claude Code auth token can be found without running inference.
 * Checks (in order):
 *  1. ANTHROPIC_API_KEY environment variable (API-key auth)
 *  2. ANTHROPIC_AUTH_TOKEN environment variable (OAuth token env override)
 *  3. <homedir>/.claude/.credentials.json (OAuth token written by `claude login`)
 *
 * Uses os.homedir() + path.join() so the check is OS-agnostic.
 */
export function claudeAuthTokenExists(): boolean {
  if (process.env['ANTHROPIC_API_KEY']) return true;
  if (process.env['ANTHROPIC_AUTH_TOKEN']) return true;
  // os.homedir() returns the platform-appropriate home directory;
  // path.join() uses the native separator (backslash on Windows, slash elsewhere).
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  return fs.existsSync(credPath);
}

function checkClaudeCode(): void {
  const version = tryExec('claude --version');
  if (!version.ok) {
    throw new PreflightError(
      'Claude Code CLI not found. Install it: https://docs.claude.ai/en/docs/claude-code'
    );
  }

  if (!claudeAuthTokenExists()) {
    throw new PreflightError(
      'Claude Code is installed but not authenticated. Run `claude` and complete login.'
    );
  }
}

function checkGitHubCLI(): void {
  const installed = tryExec('gh --version');
  if (!installed.ok) {
    throw new PreflightError(
      'GitHub CLI not found. Install it: https://cli.github.com'
    );
  }

  const auth = tryExec('gh auth status');
  if (!auth.ok) {
    throw new PreflightError(
      'GitHub CLI is not authenticated. Run `gh auth login`.'
    );
  }
}

function checkBeadsCLI(): void {
  const installed = tryExec('bd --version');
  if (!installed.ok) {
    throw new PreflightError(
      'Beads CLI not found. Install it: https://github.com/steveyegge/beads'
    );
  }

  const ready = tryExec('bd ready --json');
  if (!ready.ok) {
    throw new PreflightError(
      'Beads is not initialised in this project. Run `bd init`.'
    );
  }
}

function checkGitRemote(): PreflightResult {
  let remoteUrl: string;
  try {
    remoteUrl = getRemoteUrl();
  } catch {
    throw new PreflightError(
      'No git remote "origin" found. Quetz needs a GitHub remote to poll PRs.'
    );
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseOwnerRepo(remoteUrl));
  } catch {
    throw new PreflightError(
      `Cannot parse owner/repo from git remote: ${remoteUrl}\n` +
      'Ensure the remote is a GitHub URL (HTTPS or SSH).'
    );
  }

  const defaultBranch = getDefaultBranch();

  return { owner, repo, defaultBranch };
}

/**
 * Run all four preflight checks in order.
 * Any failure throws a PreflightError (exit code 3).
 * On success, returns inferred owner/repo/defaultBranch for config generation.
 */
export function runPreflight(): PreflightResult {
  checkClaudeCode();
  checkGitHubCLI();
  checkBeadsCLI();
  return checkGitRemote();
}
