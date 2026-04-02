import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  CommandExecutionItem,
  CodexModelReasoningEffort,
  CodexThreadOptions,
  FileChangeItem,
  McpToolCallItem,
  ThreadEvent,
  ThreadItem,
  TodoListItem,
  WebSearchItem,
} from './codex-sdk.js';
import type { ClaudeProviderConfig, CodexProviderConfig } from './config.js';
import { loadCodexSdk } from './codex-sdk.js';
import type { QuetzBus } from './events.js';
import { getProviderDescriptor, type AgentEffortLevel, type AgentProvider } from './provider.js';

const SIMULATE_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];
const DEFAULT_CLAUDE_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];
const SIMULATE_SETTING_SOURCES: SettingSource[] = [];

type ProviderConfig = ClaudeProviderConfig | CodexProviderConfig;

export interface RunAgentOptions {
  provider: AgentProvider;
  prompt: string;
  cwd: string;
  timeoutMinutes?: number;
  model: string;
  bus?: QuetzBus;
  effort?: AgentEffortLevel;
  simulate?: boolean;
  providerConfig?: ProviderConfig;
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
      return runCodexSdk({
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
  providerConfig?: ProviderConfig
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
  providerConfig?: ProviderConfig;
  abortController: AbortController;
  timer: ReturnType<typeof setTimeout>;
  timeoutMinutes: number;
}

interface CodexSdkOptions {
  prompt: string;
  cwd: string;
  model: string;
  bus?: QuetzBus;
  effort?: AgentEffortLevel;
  simulate: boolean;
  providerConfig?: ProviderConfig;
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
      : normalizeClaudeSettingSources((providerConfig as ClaudeProviderConfig | undefined)?.settingSources);

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
            emitStderr(data, bus);
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
            emitStderr(data, bus);
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

async function runCodexSdk({
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
}: CodexSdkOptions): Promise<number> {
  try {
    const codexConfig = providerConfig as CodexProviderConfig | undefined;
    const { Codex } = await loadCodexSdk();
    const apiKey = resolveCodexApiKey();
    const codex = new Codex({
      ...(codexConfig?.baseUrl ? { baseUrl: codexConfig.baseUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
    });
    const thread = codex.startThread(buildCodexThreadOptions(cwd, model, effort, simulate, codexConfig));
    const { events } = await thread.runStreamed(prompt, { signal: abortController.signal });

    let turnCompleted = false;
    let nextToolIndex = 0;
    const toolIndexes = new Map<string, number>();
    const commandOutputStates = new Map<string, CodexCommandExecutionState>();
    const toolIndexFor = (itemId: string): number => {
      const existing = toolIndexes.get(itemId);
      if (existing !== undefined) return existing;
      const index = nextToolIndex++;
      toolIndexes.set(itemId, index);
      return index;
    };

    for await (const event of events) {
      if (event.type === 'turn.completed') {
        turnCompleted = true;
      } else if (event.type === 'turn.failed') {
        emitStderr(event.error.message, bus);
        throw new Error(event.error.message);
      } else if (event.type === 'error') {
        emitStderr(event.message, bus);
        throw new Error(event.message);
      }

      handleCodexEvent(event, toolIndexFor, commandOutputStates, bus);
    }

    clearTimeout(timer);
    return turnCompleted ? 0 : 1;
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

function buildCodexThreadOptions(
  cwd: string,
  model: string,
  effort: AgentEffortLevel | undefined,
  simulate: boolean,
  providerConfig?: CodexProviderConfig
): CodexThreadOptions {
  const approvalPolicy = simulate ? 'never' : providerConfig?.approvalPolicy ?? 'never';
  const sandboxMode = simulate ? 'read-only' : providerConfig?.sandboxMode ?? 'danger-full-access';

  return {
    model,
    workingDirectory: cwd,
    approvalPolicy,
    sandboxMode,
    ...(simulate ? { networkAccessEnabled: false } : {}),
    ...(providerConfig?.networkAccessEnabled !== undefined && !simulate
      ? { networkAccessEnabled: providerConfig.networkAccessEnabled }
      : {}),
    ...(providerConfig?.webSearchMode && !simulate
      ? { webSearchMode: providerConfig.webSearchMode }
      : {}),
    ...(mapCodexEffort(effort) ? { modelReasoningEffort: mapCodexEffort(effort) } : {}),
  };
}

function mapCodexEffort(effort?: AgentEffortLevel): CodexModelReasoningEffort | undefined {
  switch (effort) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'max':
      return 'xhigh';
    default:
      return undefined;
  }
}

function resolveCodexApiKey(): string | undefined {
  return process.env['CODEX_API_KEY'] || process.env['OPENAI_API_KEY'] || undefined;
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
        emitToolStart(event.index, event.content_block.name, bus);
      }
      break;
    }
    case 'content_block_delta': {
      const delta = event.delta;
      if (delta?.type === 'input_json_delta') {
        const block = blocks.get(event.index);
        if (block) block.inputChunks.push(delta.partial_json);
      } else if (delta?.type === 'text_delta' && delta.text) {
        emitAgentText(delta.text, bus);
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
        emitToolDone(event.index, block.name, summary, bus);
        blocks.delete(event.index);
      }
      break;
    }
  }
}

function handleCodexEvent(
  event: ThreadEvent,
  toolIndexFor: (itemId: string) => number,
  commandOutputStates: Map<string, CodexCommandExecutionState>,
  bus?: QuetzBus
): void {
  if (!('item' in event)) return;

  const item = event.item;

  if (event.type === 'item.started' && isCodexToolItem(item)) {
    emitToolStart(toolIndexFor(item.id), codexToolName(item), bus);
    return;
  }

  if (item.type === 'command_execution' && (event.type === 'item.updated' || event.type === 'item.completed')) {
    emitCodexCommandExecutionStderr(item, commandOutputStates, bus);
  }

  if (event.type !== 'item.completed') return;

  switch (item.type) {
    case 'agent_message':
      if (item.text) emitAgentText(item.text, bus);
      return;
    case 'reasoning':
      return;
    case 'error':
      emitStderr(item.message || 'Unknown Codex error', bus);
      return;
    case 'command_execution':
      emitToolDone(toolIndexFor(item.id), codexToolName(item), summarizeCodexItem(item), bus);
      commandOutputStates.delete(item.id);
      return;
    case 'mcp_tool_call':
    case 'file_change':
    case 'web_search':
    case 'todo_list':
      emitToolDone(toolIndexFor(item.id), codexToolName(item), summarizeCodexItem(item), bus);
      return;
  }
}

interface CodexCommandExecutionState {
  emittedOutput: string;
}

function emitCodexCommandExecutionStderr(
  item: CommandExecutionItem,
  commandOutputStates: Map<string, CodexCommandExecutionState>,
  bus?: QuetzBus
): void {
  const aggregatedOutput = item.aggregated_output ?? '';
  const previousState = commandOutputStates.get(item.id);
  const previousOutput = previousState?.emittedOutput ?? '';
  const delta = computeCommandExecutionDelta(previousOutput, aggregatedOutput);

  if (delta) {
    emitStderr(delta, bus);
  }

  commandOutputStates.set(item.id, { emittedOutput: aggregatedOutput });
}

function computeCommandExecutionDelta(previousOutput: string, currentOutput: string): string {
  if (!currentOutput) return '';
  if (!previousOutput) return currentOutput;
  if (currentOutput.startsWith(previousOutput)) {
    return currentOutput.slice(previousOutput.length);
  }
  return currentOutput;
}

function isCodexToolItem(item: ThreadItem): item is CommandExecutionItem | FileChangeItem | McpToolCallItem | WebSearchItem | TodoListItem {
  return item.type === 'command_execution'
    || item.type === 'file_change'
    || item.type === 'mcp_tool_call'
    || item.type === 'web_search'
    || item.type === 'todo_list';
}

function codexToolName(item: CommandExecutionItem | FileChangeItem | McpToolCallItem | WebSearchItem | TodoListItem): string {
  switch (item.type) {
    case 'command_execution':
      return 'Bash';
    case 'mcp_tool_call':
      return `${item.server}.${item.tool}`;
    case 'file_change':
      return 'ApplyPatch';
    case 'web_search':
      return 'WebSearch';
    case 'todo_list':
      return 'Plan';
  }
}

function summarizeCodexItem(item: CommandExecutionItem | FileChangeItem | McpToolCallItem | WebSearchItem | TodoListItem): string {
  switch (item.type) {
    case 'command_execution':
      return summarizeCodexCommand(item.command ?? '');
    case 'mcp_tool_call':
      return summarizeToolInput(item.arguments);
    case 'file_change':
      return item.changes.map(change => shortPath(change.path)).join(', ');
    case 'web_search':
      return item.query;
    case 'todo_list': {
      const pending = item.items.find(todo => !todo.completed) ?? item.items[0];
      return pending ? truncate(pending.text, 60) : 'updated';
    }
  }
}

function summarizeToolInput(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return typeof value === 'string' ? truncate(value, 60) : '';
  }

  const firstValue = Object.values(value as Record<string, unknown>).find(candidate => typeof candidate === 'string');
  return firstValue ? truncate(String(firstValue), 60) : '';
}

function emitAgentText(text: string, bus?: QuetzBus): void {
  if (bus) bus.emit('agent:text', { text });
  else process.stdout.write(text);
}

function emitStderr(data: string, bus?: QuetzBus): void {
  if (!data) return;
  if (bus) bus.emit('agent:stderr', { data });
  else process.stderr.write(data);
}

function emitToolStart(index: number, name: string, bus?: QuetzBus): void {
  if (bus) bus.emit('agent:tool_start', { index, name });
}

function emitToolDone(index: number, name: string, summary: string, bus?: QuetzBus): void {
  if (bus) bus.emit('agent:tool_done', { index, name, summary });
  else process.stdout.write(`  [${name}] ${summary}\n`);
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

function summarizeCodexCommand(command: string): string {
  const commandFlagMatch = command.match(/-Command\s+/i);
  if (commandFlagMatch) {
    let summary = command.slice(commandFlagMatch.index! + commandFlagMatch[0].length).trim();
    if (
      (summary.startsWith('"') && summary.endsWith('"')) ||
      (summary.startsWith('\'') && summary.endsWith('\''))
    ) {
      summary = summary.slice(1, -1);
    }
    return truncate(summary, 60);
  }

  return truncate(command, 60);
}

function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
