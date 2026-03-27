import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProviderConfig } from './config.js';
import type { QuetzBus } from './events.js';
import { getProviderDescriptor, type AgentEffortLevel, type AgentProvider } from './provider.js';

const SIMULATE_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];
const DEFAULT_CLAUDE_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];
const SIMULATE_SETTING_SOURCES: SettingSource[] = [];

export interface RunAgentOptions {
  provider: AgentProvider;
  prompt: string;
  cwd: string;
  timeoutMinutes?: number;
  model: string;
  bus?: QuetzBus;
  effort?: AgentEffortLevel;
  simulate?: boolean;
  providerConfig?: ClaudeProviderConfig;
}

export function runAgent({
  provider,
  prompt,
  cwd,
  timeoutMinutes = 30,
  model,
  bus,
  effort,
  simulate = false,
  providerConfig,
}: RunAgentOptions): Promise<number> {
  const descriptor = getProviderDescriptor(provider);

  if (!descriptor.capabilities.runtimeImplemented) {
    throw new Error(
      `${descriptor.displayName} runtime support has not landed yet. Track quetz-88v for the concrete adapter work.`
    );
  }

  const abortController = new AbortController();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  switch (provider) {
    case 'claude':
      return runClaudeQuery({
        prompt,
        cwd,
        model,
        bus,
        effort,
        simulate,
        providerConfig,
        abortController,
        timer,
        timeoutMinutes,
      });
    case 'codex':
      throw new Error('Codex runtime support has not landed yet.');
  }
}

export function spawnAgent(
  prompt: string,
  cwd: string,
  timeoutMinutes: number = 30,
  model: string = 'sonnet',
  bus?: QuetzBus,
  effort?: AgentEffortLevel,
  simulate: boolean = false,
  provider: AgentProvider = 'claude',
  providerConfig?: ClaudeProviderConfig
): Promise<number> {
  return runAgent({
    provider,
    prompt,
    cwd,
    timeoutMinutes,
    model,
    bus,
    effort,
    simulate,
    providerConfig,
  });
}

interface ClaudeQueryOptions {
  prompt: string;
  cwd: string;
  model: string;
  bus?: QuetzBus;
  effort?: AgentEffortLevel;
  simulate: boolean;
  providerConfig?: ClaudeProviderConfig;
  abortController: AbortController;
  timer: ReturnType<typeof setTimeout>;
  timeoutMinutes: number;
}

async function runClaudeQuery({
  prompt,
  cwd,
  model,
  bus,
  effort,
  simulate,
  providerConfig,
  abortController,
  timer,
  timeoutMinutes,
}: ClaudeQueryOptions): Promise<number> {
  try {
    const settingSources = simulate
      ? SIMULATE_SETTING_SOURCES
      : normalizeClaudeSettingSources(providerConfig?.settingSources);

    const options: Options = simulate
      ? {
          cwd,
          model,
          abortController,
          permissionMode: 'dontAsk' as const,
          systemPrompt: { type: 'preset' as const, preset: 'claude_code' as const },
          settingSources,
          tools: [...SIMULATE_ALLOWED_TOOLS],
          allowedTools: [...SIMULATE_ALLOWED_TOOLS],
          includePartialMessages: true,
          ...(effort ? { effort } : {}),
          stderr: (data: string) => {
            if (bus) bus.emit('agent:stderr', { data });
            else process.stderr.write(data);
          },
        }
      : {
          cwd,
          model,
          abortController,
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          systemPrompt: { type: 'preset' as const, preset: 'claude_code' as const },
          settingSources,
          includePartialMessages: true,
          ...(effort ? { effort } : {}),
          stderr: (data: string) => {
            if (bus) bus.emit('agent:stderr', { data });
            else process.stderr.write(data);
          },
        };

    const q = query({
      prompt,
      options,
    });

    const blocks = new Map<number, BlockState>();

    for await (const message of q) {
      if (message.type === 'stream_event') {
        renderStreamEvent((message as SDKPartialAssistantMessage).event, blocks, bus);
      } else if (message.type === 'result') {
        clearTimeout(timer);
        const result = message as SDKResultMessage;
        return result.subtype === 'success' && !result.is_error ? 0 : 1;
      }
    }

    clearTimeout(timer);
    return 1;
  } catch (err) {
    clearTimeout(timer);
    if (abortController.signal.aborted) {
      throw new Error(`Agent timed out after ${timeoutMinutes} minutes`);
    }
    throw new Error(`Agent process error: ${(err as Error).message}`);
  }
}

function normalizeClaudeSettingSources(settingSources?: string[]): SettingSource[] {
  if (!Array.isArray(settingSources) || settingSources.length === 0) {
    return [...DEFAULT_CLAUDE_SETTING_SOURCES];
  }
  return settingSources.filter((value): value is SettingSource =>
    value === 'user' || value === 'project' || value === 'local'
  );
}

interface BlockState {
  name: string;
  inputChunks: string[];
}

function renderStreamEvent(event: any, blocks: Map<number, BlockState>, bus?: QuetzBus): void {
  switch (event.type) {
    case 'content_block_start': {
      if (event.content_block?.type === 'tool_use') {
        blocks.set(event.index, {
          name: event.content_block.name,
          inputChunks: [],
        });
        if (bus) bus.emit('agent:tool_start', { index: event.index, name: event.content_block.name });
      }
      break;
    }
    case 'content_block_delta': {
      const delta = event.delta;
      if (delta?.type === 'input_json_delta') {
        const block = blocks.get(event.index);
        if (block) block.inputChunks.push(delta.partial_json);
      } else if (delta?.type === 'text_delta' && delta.text) {
        if (bus) bus.emit('agent:text', { text: delta.text });
        else process.stdout.write(delta.text);
      }
      break;
    }
    case 'content_block_stop': {
      const block = blocks.get(event.index);
      if (block) {
        const inputStr = block.inputChunks.join('');
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(inputStr) as Record<string, unknown>;
        } catch {
          input = {};
        }
        const summary = formatToolSummary(block.name, input);
        if (bus) bus.emit('agent:tool_done', { index: event.index, name: block.name, summary });
        else process.stdout.write(`  [${block.name}] ${summary}\n`);
        blocks.delete(event.index);
      }
      break;
    }
  }
}

function formatToolSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return shortPath(String(input.file_path ?? ''));
    case 'Bash':
      return truncate(String(input.command ?? ''), 60);
    case 'Glob':
      return String(input.pattern ?? '');
    case 'Grep':
      return `"${truncate(String(input.pattern ?? ''), 40)}"`;
    default: {
      const firstValue = Object.values(input).find(value => typeof value === 'string');
      return firstValue ? truncate(String(firstValue), 50) : '';
    }
  }
}

function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
