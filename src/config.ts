import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  AGENT_EFFORT_LEVELS,
  AGENT_PROVIDERS,
  isAgentEffortLevel,
  isAgentProvider,
  type AgentEffortLevel,
  type AgentProvider,
} from './provider.js';

export const CLAUDE_EFFORT_LEVELS = AGENT_EFFORT_LEVELS;
export const CLAUDE_THINKING_LEVELS = CLAUDE_EFFORT_LEVELS;

export type ClaudeEffortLevel = AgentEffortLevel;
export type ClaudeThinkingLevel = ClaudeEffortLevel;

export interface ClaudeProviderConfig {
  model?: string;
  effort?: AgentEffortLevel;
  settingSources?: string[];
}

export interface CodexProviderConfig {
  model?: string;
  effort?: AgentEffortLevel;
  baseUrl?: string;
  approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  networkAccessEnabled?: boolean;
  webSearchMode?: 'disabled' | 'cached' | 'live';
}

export interface AgentConfig {
  provider: AgentProvider;
  timeout: number;
  model?: string;
  effort?: AgentEffortLevel;
  prompt?: string;
  providers: {
    claude: ClaudeProviderConfig;
    codex: CodexProviderConfig;
  };
}

export interface QuetzConfig {
  github: {
    owner: string;
    repo: string;
    defaultBranch: string;
    automergeLabel: string;
  };
  agent: AgentConfig;
  poll: {
    interval: number;
    mergeTimeout: number;
    prDetectionTimeout: number;
  };
  display: {
    animations: boolean;
    colors: boolean;
  };
}

const DEFAULT_CLAUDE_SETTING_SOURCES = ['user', 'project', 'local'];
const CONFIG_FILE = '.quetzrc.yml';

export const DEFAULTS: QuetzConfig = {
  github: {
    owner: '',
    repo: '',
    defaultBranch: 'main',
    automergeLabel: 'automerge',
  },
  agent: {
    provider: 'claude',
    timeout: 30,
    model: 'sonnet',
    providers: {
      claude: {
        settingSources: [...DEFAULT_CLAUDE_SETTING_SOURCES],
      },
      codex: {},
    },
  },
  poll: {
    interval: 30,
    mergeTimeout: 15,
    prDetectionTimeout: 60,
  },
  display: {
    animations: true,
    colors: supportsColor(),
  },
};

function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

export class ConfigError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function isClaudeEffortLevel(value: unknown): value is ClaudeEffortLevel {
  return isAgentEffortLevel(value);
}

export const isClaudeThinkingLevel = isClaudeEffortLevel;

function isCodexApprovalPolicy(value: unknown): value is NonNullable<CodexProviderConfig['approvalPolicy']> {
  return value === 'never' || value === 'on-request' || value === 'on-failure' || value === 'untrusted';
}

function isCodexSandboxMode(value: unknown): value is NonNullable<CodexProviderConfig['sandboxMode']> {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}

function isCodexWebSearchMode(value: unknown): value is NonNullable<CodexProviderConfig['webSearchMode']> {
  return value === 'disabled' || value === 'cached' || value === 'live';
}

export function loadConfig(projectRoot: string = process.cwd()): QuetzConfig {
  const configPath = path.join(projectRoot, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}\nRun \`quetz init\` to generate it.`
    );
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    raw = parseYaml(content);
  } catch (err) {
    throw new ConfigError(`Failed to parse ${CONFIG_FILE}: ${(err as Error).message}`);
  }

  return validateAndMerge(raw);
}

function validateAndMerge(raw: unknown): QuetzConfig {
  if (!raw || typeof raw !== 'object') {
    throw new ConfigError(`${CONFIG_FILE} must be a YAML object.`);
  }

  const obj = raw as Record<string, unknown>;
  const github = obj['github'] as Record<string, unknown> | undefined;
  if (!github || typeof github !== 'object') {
    throw new ConfigError(`${CONFIG_FILE}: missing required section "github".`);
  }

  const owner = github['owner'];
  const repo = github['repo'];

  if (!owner || typeof owner !== 'string' || owner.trim() === '') {
    throw new ConfigError(`${CONFIG_FILE}: "github.owner" is required.`);
  }
  if (!repo || typeof repo !== 'string' || repo.trim() === '') {
    throw new ConfigError(`${CONFIG_FILE}: "github.repo" is required.`);
  }

  const agent = (obj['agent'] as Record<string, unknown> | undefined) ?? {};
  const poll = (obj['poll'] as Record<string, unknown> | undefined) ?? {};
  const display = (obj['display'] as Record<string, unknown> | undefined) ?? {};
  const providerBlocks = (agent['providers'] as Record<string, unknown> | undefined) ?? {};
  const claudeProvider = (providerBlocks['claude'] as Record<string, unknown> | undefined) ?? {};
  const codexProvider = (providerBlocks['codex'] as Record<string, unknown> | undefined) ?? {};
  const provider = agent['provider'] ?? DEFAULTS.agent.provider;
  const effort = agent['effort'] ?? agent['thinkingLevel'];
  const claudeEffort = claudeProvider['effort'];
  const codexEffort = codexProvider['effort'];
  const codexApprovalPolicy = codexProvider['approvalPolicy'];
  const codexSandboxMode = codexProvider['sandboxMode'];
  const codexWebSearchMode = codexProvider['webSearchMode'];

  if (!isAgentProvider(provider)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.provider" must be one of ${AGENT_PROVIDERS.join(', ')}.`
    );
  }
  if (effort !== undefined && !isAgentEffortLevel(effort)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.effort" must be one of ${AGENT_EFFORT_LEVELS.join(', ')}.`
    );
  }
  if (claudeEffort !== undefined && !isAgentEffortLevel(claudeEffort)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.claude.effort" must be one of ${AGENT_EFFORT_LEVELS.join(', ')}.`
    );
  }
  if (codexEffort !== undefined && !isAgentEffortLevel(codexEffort)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.codex.effort" must be one of ${AGENT_EFFORT_LEVELS.join(', ')}.`
    );
  }
  if (codexProvider['profile'] !== undefined) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.codex.profile" is no longer supported with the SDK runtime. Use the SDK-backed fields instead.`
    );
  }
  if (codexApprovalPolicy !== undefined && !isCodexApprovalPolicy(codexApprovalPolicy)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.codex.approvalPolicy" must be one of never, on-request, on-failure, untrusted.`
    );
  }
  if (codexSandboxMode !== undefined && !isCodexSandboxMode(codexSandboxMode)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.codex.sandboxMode" must be one of read-only, workspace-write, danger-full-access.`
    );
  }
  if (codexWebSearchMode !== undefined && !isCodexWebSearchMode(codexWebSearchMode)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.providers.codex.webSearchMode" must be one of disabled, cached, live.`
    );
  }

  return {
    github: {
      owner: owner.trim(),
      repo: (repo as string).trim(),
      defaultBranch:
        typeof github['defaultBranch'] === 'string'
          ? github['defaultBranch']
          : DEFAULTS.github.defaultBranch,
      automergeLabel:
        typeof github['automergeLabel'] === 'string'
          ? github['automergeLabel']
          : DEFAULTS.github.automergeLabel,
    },
    agent: {
      provider,
      timeout:
        typeof agent['timeout'] === 'number'
          ? agent['timeout']
          : DEFAULTS.agent.timeout,
      model:
        typeof agent['model'] === 'string'
          ? agent['model']
          : DEFAULTS.agent.model,
      effort: effort as AgentEffortLevel | undefined,
      prompt: typeof agent['prompt'] === 'string' ? agent['prompt'] : undefined,
      providers: {
        claude: {
          model:
            typeof claudeProvider['model'] === 'string'
              ? claudeProvider['model']
              : undefined,
          effort: claudeEffort as AgentEffortLevel | undefined,
          settingSources:
            Array.isArray(claudeProvider['settingSources'])
              ? claudeProvider['settingSources'].filter((value): value is string => typeof value === 'string')
              : [...DEFAULT_CLAUDE_SETTING_SOURCES],
        },
        codex: {
          model:
            typeof codexProvider['model'] === 'string'
              ? codexProvider['model']
              : undefined,
          effort: codexEffort as AgentEffortLevel | undefined,
          baseUrl:
            typeof codexProvider['baseUrl'] === 'string'
              ? codexProvider['baseUrl']
              : undefined,
          approvalPolicy:
            isCodexApprovalPolicy(codexApprovalPolicy)
              ? codexApprovalPolicy
              : undefined,
          sandboxMode:
            isCodexSandboxMode(codexSandboxMode)
              ? codexSandboxMode
              : undefined,
          networkAccessEnabled:
            typeof codexProvider['networkAccessEnabled'] === 'boolean'
              ? codexProvider['networkAccessEnabled']
              : undefined,
          webSearchMode:
            isCodexWebSearchMode(codexWebSearchMode)
              ? codexWebSearchMode
              : undefined,
        },
      },
    },
    poll: {
      interval:
        typeof poll['interval'] === 'number'
          ? poll['interval']
          : DEFAULTS.poll.interval,
      mergeTimeout:
        typeof poll['mergeTimeout'] === 'number'
          ? poll['mergeTimeout']
          : DEFAULTS.poll.mergeTimeout,
      prDetectionTimeout:
        typeof poll['prDetectionTimeout'] === 'number'
          ? poll['prDetectionTimeout']
          : DEFAULTS.poll.prDetectionTimeout,
    },
    display: {
      animations:
        typeof display['animations'] === 'boolean'
          ? display['animations']
          : DEFAULTS.display.animations,
      colors:
        typeof display['colors'] === 'boolean'
          ? display['colors']
          : DEFAULTS.display.colors,
    },
  };
}

export function writeConfig(config: QuetzConfig, projectRoot: string = process.cwd()): void {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  const content = stringifyYaml(config, { lineWidth: 0 });
  fs.writeFileSync(configPath, content, 'utf-8');
}

export function validateConfig(projectRoot: string = process.cwd()): void {
  loadConfig(projectRoot);
}

export function showConfig(projectRoot: string = process.cwd()): void {
  const config = loadConfig(projectRoot);
  const yaml = stringifyYaml(config, { lineWidth: 0 });
  process.stdout.write('Current .quetzrc.yml:\n\n');
  process.stdout.write(yaml);
}
