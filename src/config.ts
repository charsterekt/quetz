import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const CLAUDE_THINKING_LEVELS = ['low', 'medium', 'high', 'max'] as const;

export type ClaudeThinkingLevel = (typeof CLAUDE_THINKING_LEVELS)[number];

export interface QuetzConfig {
  github: {
    owner: string;
    repo: string;
    defaultBranch: string;
    automergeLabel: string;
  };
  agent: {
    timeout: number;
    model?: string;
    thinkingLevel?: ClaudeThinkingLevel;
    prompt?: string;
  };
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

const CONFIG_FILE = '.quetzrc.yml';

export const DEFAULTS: QuetzConfig = {
  github: {
    owner: '',
    repo: '',
    defaultBranch: 'main',
    automergeLabel: 'automerge',
  },
  agent: {
    timeout: 30,
    model: 'sonnet',
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

export function isClaudeThinkingLevel(value: unknown): value is ClaudeThinkingLevel {
  return typeof value === 'string' && CLAUDE_THINKING_LEVELS.includes(value as ClaudeThinkingLevel);
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
    throw new ConfigError(
      `Failed to parse ${CONFIG_FILE}: ${(err as Error).message}`
    );
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
  const thinkingLevel = agent['thinkingLevel'];

  if (thinkingLevel !== undefined && !isClaudeThinkingLevel(thinkingLevel)) {
    throw new ConfigError(
      `${CONFIG_FILE}: "agent.thinkingLevel" must be one of ${CLAUDE_THINKING_LEVELS.join(', ')}.`
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
      timeout:
        typeof agent['timeout'] === 'number'
          ? agent['timeout']
          : DEFAULTS.agent.timeout,
      model:
        typeof agent['model'] === 'string'
          ? agent['model']
          : DEFAULTS.agent.model,
      thinkingLevel: thinkingLevel as ClaudeThinkingLevel | undefined,
      prompt:
        typeof agent['prompt'] === 'string' ? agent['prompt'] : undefined,
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

/**
 * Validate config without returning; throws on error.
 * Used by `quetz validate` command.
 */
export function validateConfig(projectRoot: string = process.cwd()): void {
  loadConfig(projectRoot);
}

/**
 * Display the parsed config to stdout (for debugging).
 * Used by `quetz config show` command.
 */
export function showConfig(projectRoot: string = process.cwd()): void {
  const config = loadConfig(projectRoot);
  const yaml = stringifyYaml(config, { lineWidth: 0 });
  process.stdout.write('Current .quetzrc.yml:\n\n');
  process.stdout.write(yaml);
}
