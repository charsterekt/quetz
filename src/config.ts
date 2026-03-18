import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface QuetzConfig {
  github: {
    owner: string;
    repo: string;
    defaultBranch: string;
    automergeLabel: string;
  };
  agent: {
    timeout: number;
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
