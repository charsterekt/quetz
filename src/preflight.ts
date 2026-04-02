import { execSync } from 'child_process';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { getRemoteUrl, parseOwnerRepo, getDefaultBranch } from './git.js';
import {
  AGENT_PROVIDERS,
  getProviderDescriptor,
  type AgentProvider,
} from './provider.js';

export interface ProviderStatus {
  provider: AgentProvider;
  installed: boolean;
  authenticated: boolean;
  runtimeImplemented: boolean;
  warnings: string[];
}

export interface PreflightResult {
  owner: string;
  repo: string;
  defaultBranch: string;
  providerStatuses: ProviderStatus[];
  preferredProvider: AgentProvider;
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

export function claudeAuthTokenExists(): boolean {
  if (process.env['ANTHROPIC_API_KEY']) return true;
  if (process.env['ANTHROPIC_AUTH_TOKEN']) return true;
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  return fs.existsSync(credPath);
}

function codexAuthTokenExists(): boolean {
  if (process.env['OPENAI_API_KEY']) return true;
  if (process.env['CODEX_API_KEY']) return true;
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  return fs.existsSync(authPath);
}

function isProviderAuthenticated(provider: AgentProvider): boolean {
  switch (provider) {
    case 'claude':
      return claudeAuthTokenExists();
    case 'codex':
      return codexAuthTokenExists();
  }
}

const runtimeRequire = createRequire(__filename);

function isProviderInstalled(provider: AgentProvider): boolean {
  const descriptor = getProviderDescriptor(provider);

  if (descriptor.runtime.kind === 'sdk') {
    const packageName = descriptor.runtime.packageName;
    const checkCommand = descriptor.runtime.checkCommand;
    if (!packageName || !checkCommand) return false;
    const packagePath = path.join(process.cwd(), 'node_modules', ...packageName.split('/'));
    const packageInstalled = fs.existsSync(packagePath) || (() => {
      try {
        runtimeRequire.resolve(packageName);
        return true;
      } catch {
        return false;
      }
    })();
    return packageInstalled && tryExec(checkCommand).ok;
  }

  const checkCommand = descriptor.runtime.checkCommand;
  if (!checkCommand) return false;
  return tryExec(checkCommand).ok;
}

function getProviderStatuses(): ProviderStatus[] {
  return AGENT_PROVIDERS.map(provider => {
    const descriptor = getProviderDescriptor(provider);
    const installed = isProviderInstalled(provider);
    const authenticated = installed ? isProviderAuthenticated(provider) : false;
    const warnings: string[] = [];

    if (installed && !authenticated) {
      warnings.push(`${descriptor.displayName} is installed but not authenticated.`);
    }
    if (installed && authenticated && !descriptor.capabilities.runtimeImplemented) {
      warnings.push(
        `${descriptor.displayName} is detected but Quetz runtime support is still tracked separately.`
      );
    }

    return {
      provider,
      installed,
      authenticated,
      runtimeImplemented: descriptor.capabilities.runtimeImplemented,
      warnings,
    };
  });
}

function assertSupportedProvider(statuses: ProviderStatus[], selectedProvider?: AgentProvider): AgentProvider {
  const usable = statuses.filter(status =>
    status.installed && status.authenticated && status.runtimeImplemented
  );
  const claudeStatus = statuses.find(status => status.provider === 'claude');

  if (selectedProvider) {
    const selectedStatus = statuses.find(status => status.provider === selectedProvider);
    if (!selectedStatus?.installed) {
      const descriptor = getProviderDescriptor(selectedProvider);
      throw new PreflightError(
        `${descriptor.displayName} runtime unavailable. ${descriptor.runtime.installHint}`
      );
    }
    if (!selectedStatus.authenticated) {
      const descriptor = getProviderDescriptor(selectedProvider);
      throw new PreflightError(
        `${descriptor.displayName} is installed but not authenticated. ${descriptor.runtime.loginHint}`
      );
    }
    if (!selectedStatus.runtimeImplemented) {
      const descriptor = getProviderDescriptor(selectedProvider);
      throw new PreflightError(
        `${descriptor.displayName} is detected, but Quetz runtime support has not landed yet. Track quetz-88v.`
      );
    }
    return selectedProvider;
  }

  if (usable.length === 0) {
    if (claudeStatus && claudeStatus.installed && !claudeStatus.authenticated) {
      const descriptor = getProviderDescriptor('claude');
      throw new PreflightError(
        `${descriptor.displayName} is installed but not authenticated. ${descriptor.runtime.loginHint}`
      );
    }

    const installedButUnauthorized = statuses.filter(status => status.installed && !status.authenticated);
    if (installedButUnauthorized.length > 0) {
      const providerNames = installedButUnauthorized
        .map(status => getProviderDescriptor(status.provider).displayName)
        .join(', ');
      throw new PreflightError(
        `No supported agent runtime is ready. Installed but unauthenticated: ${providerNames}. Authenticate one provider and rerun init.`
      );
    }

    if (claudeStatus && !claudeStatus.installed) {
      const descriptor = getProviderDescriptor('claude');
      throw new PreflightError(
        `${descriptor.displayName} runtime unavailable. ${descriptor.runtime.installHint}`
      );
    }

    throw new PreflightError(
      `No supported agent runtime found. Install one of: ${AGENT_PROVIDERS.join(', ')}.`
    );
  }

  return usable[0].provider;
}

function checkGitHubCLI(): void {
  const installed = tryExec('gh --version');
  if (!installed.ok) {
    throw new PreflightError('GitHub CLI not found. Install it: https://cli.github.com');
  }

  const auth = tryExec('gh auth status');
  if (!auth.ok) {
    throw new PreflightError('GitHub CLI is not authenticated. Run `gh auth login`.');
  }
}

function checkBeadsCLI(): void {
  const installed = tryExec('bd --version');
  if (!installed.ok) {
    throw new PreflightError('Beads CLI not found. Install it: https://github.com/steveyegge/beads');
  }

  const ready = tryExec('bd ready --json');
  if (!ready.ok) {
    throw new PreflightError('Beads is not initialised in this project. Run `bd init`.');
  }
}

function checkGitRemote(): Pick<PreflightResult, 'owner' | 'repo' | 'defaultBranch'> {
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
      `Cannot parse owner/repo from git remote: ${remoteUrl}\nEnsure the remote is a GitHub URL (HTTPS or SSH).`
    );
  }

  return { owner, repo, defaultBranch: getDefaultBranch() };
}

export function runPreflight(selectedProvider?: AgentProvider): PreflightResult {
  const providerStatuses = getProviderStatuses();
  const preferredProvider = assertSupportedProvider(providerStatuses, selectedProvider);
  checkGitHubCLI();
  checkBeadsCLI();
  return {
    ...checkGitRemote(),
    providerStatuses,
    preferredProvider,
  };
}
