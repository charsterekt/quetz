export const AGENT_PROVIDERS = ['claude', 'codex'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;
export type AgentEffortLevel = (typeof AGENT_EFFORT_LEVELS)[number];

export interface ProviderCapabilities {
  supportsEffort: boolean;
  runtimeImplemented: boolean;
}

export interface ProviderCliDescriptor {
  command: string;
  authStatusCommand: string;
  installHint: string;
  loginHint: string;
}

export interface ProviderDescriptor {
  id: AgentProvider;
  displayName: string;
  defaultModel: string;
  capabilities: ProviderCapabilities;
  cli: ProviderCliDescriptor;
}

export const PROVIDER_DESCRIPTORS: Record<AgentProvider, ProviderDescriptor> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    defaultModel: 'sonnet',
    capabilities: {
      supportsEffort: true,
      runtimeImplemented: true,
    },
    cli: {
      command: 'claude',
      authStatusCommand: 'claude --version',
      installHint: 'Install it: https://docs.claude.ai/en/docs/claude-code',
      loginHint: 'Run `claude` and complete login.',
    },
  },
  codex: {
    id: 'codex',
    displayName: 'Codex CLI',
    defaultModel: 'gpt-5-codex',
    capabilities: {
      supportsEffort: true,
      runtimeImplemented: true,
    },
    cli: {
      command: 'codex',
      authStatusCommand: 'codex login status',
      installHint: 'Install it: https://developers.openai.com/codex/cli',
      loginHint: 'Run `codex login` and complete login.',
    },
  },
};

export function isAgentProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && AGENT_PROVIDERS.includes(value as AgentProvider);
}

export function isAgentEffortLevel(value: unknown): value is AgentEffortLevel {
  return typeof value === 'string' && AGENT_EFFORT_LEVELS.includes(value as AgentEffortLevel);
}

export function getProviderDescriptor(provider: AgentProvider): ProviderDescriptor {
  return PROVIDER_DESCRIPTORS[provider];
}

export function formatProviderModel(provider: AgentProvider, model: string): string {
  const descriptor = getProviderDescriptor(provider);
  return `${descriptor.id} ${model}`.trim();
}
