export const AGENT_PROVIDERS = ['claude', 'codex'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;
export type AgentEffortLevel = (typeof AGENT_EFFORT_LEVELS)[number];

export interface ProviderCapabilities {
  supportsEffort: boolean;
  runtimeImplemented: boolean;
}

export interface ProviderRuntimeDescriptor {
  kind: 'cli' | 'sdk';
  checkCommand?: string;
  packageName?: string;
  installHint: string;
  loginHint: string;
  unavailableLabel: string;
}

export interface ProviderDescriptor {
  id: AgentProvider;
  displayName: string;
  defaultModel: string;
  knownModels: string[];
  modelNote?: string;
  capabilities: ProviderCapabilities;
  runtime: ProviderRuntimeDescriptor;
}

export const PROVIDER_DESCRIPTORS: Record<AgentProvider, ProviderDescriptor> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    defaultModel: 'sonnet',
    knownModels: ['haiku', 'sonnet', 'opus'],
    modelNote: 'Quetz passes model names straight through to Claude Code.',
    capabilities: {
      supportsEffort: true,
      runtimeImplemented: true,
    },
    runtime: {
      kind: 'cli',
      checkCommand: 'claude --version',
      installHint: 'Install it: https://docs.claude.ai/en/docs/claude-code',
      loginHint: 'Run `claude` and complete login.',
      unavailableLabel: 'CLI not found',
    },
  },
  codex: {
    id: 'codex',
    displayName: 'Codex SDK',
    defaultModel: 'gpt-5-codex',
    knownModels: ['gpt-5-codex', 'gpt-5', 'gpt-5.1'],
    modelNote: 'Quetz uses the official Codex SDK; the local runtime still requires the Codex CLI.',
    capabilities: {
      supportsEffort: true,
      runtimeImplemented: true,
    },
    runtime: {
      kind: 'sdk',
      checkCommand: 'codex --version',
      packageName: '@openai/codex-sdk',
      installHint: 'Install the Codex CLI runtime and ensure @openai/codex-sdk is available.',
      loginHint: 'Run `codex login` or set `OPENAI_API_KEY` / `CODEX_API_KEY`.',
      unavailableLabel: 'CLI or SDK missing',
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

export function resolveProviderModel(
  provider: AgentProvider,
  configuredProvider: AgentProvider,
  globalModel: string | undefined,
  providerModel: string | undefined
): string {
  return providerModel
    ?? (configuredProvider === provider ? globalModel : undefined)
    ?? getProviderDescriptor(provider).defaultModel;
}

export function renderModelListing(provider?: AgentProvider): string {
  const providers = provider ? [provider] : [...AGENT_PROVIDERS];
  const blocks = providers.map(id => {
    const descriptor = getProviderDescriptor(id);
    const lines = [
      `${descriptor.id}: ${descriptor.displayName}`,
      `  default: ${descriptor.defaultModel}`,
      `  known:   ${descriptor.knownModels.join(', ')}`,
    ];

    if (descriptor.modelNote) {
      lines.push(`  note:    ${descriptor.modelNote}`);
    }

    return lines.join('\n');
  });

  return `${blocks.join('\n\n')}\n`;
}
