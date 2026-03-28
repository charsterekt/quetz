import { spawn } from 'child_process';
import * as readline from 'readline';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProviderConfig, CodexProviderConfig } from './config.js';
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
      return runCodexExec({
        prompt,
        cwd,
        model,
        bus,
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

interface CodexExecOptions {
  prompt: string;
  cwd: string;
  model: string;
  bus?: QuetzBus;
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

async function runCodexExec({
  prompt,
  cwd,
  model,
  bus,
  simulate,
  providerConfig,
  abortController,
  timer,
  timeoutMinutes,
}: CodexExecOptions): Promise<number> {
  const codexConfig = providerConfig as CodexProviderConfig | undefined;
  const args = ['exec', '--json', '--color', 'never', '--cd', cwd, '--model', model];

  if (codexConfig?.profile) {
    args.push('--profile', codexConfig.profile);
  }

  if (simulate) {
    args.push('--sandbox', 'read-only');
  } else {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  }

  return new Promise<number>((resolve, reject) => {
    const child = spawn('codex', args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let settled = false;
    let stderr = '';
    let nextToolIndex = 0;
    const toolIndexes = new Map<string, number>();

    const stdoutLines = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    const cleanup = () => {
      abortController.signal.removeEventListener('abort', onAbort);
      stdoutLines.close();
    };

    const finishResolve = (exitCode: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      resolve(exitCode);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      reject(err);
    };

    const toolIndexFor = (itemId: string): number => {
      const existing = toolIndexes.get(itemId);
      if (existing !== undefined) return existing;
      const index = nextToolIndex++;
      toolIndexes.set(itemId, index);
      return index;
    };

    const onAbort = () => {
      child.kill();
    };

    stdoutLines.on('line', line => {
      if (!line.trim()) return;

      let event: CodexEvent;
      try {
        event = JSON.parse(line) as CodexEvent;
      } catch {
        finishReject(new Error(`Codex emitted invalid JSONL: ${line}`));
        return;
      }

      handleCodexEvent(event, toolIndexFor, bus);
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string | Buffer) => {
      const data = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      stderr += data;
      if (bus) bus.emit('agent:stderr', { data });
      else process.stderr.write(data);
    });

    child.on('error', err => {
      finishReject(new Error(`Agent process error: ${err.message}`));
    });

    child.on('close', code => {
      if (abortController.signal.aborted) {
        finishReject(new Error(`Agent timed out after ${timeoutMinutes} minutes`));
        return;
      }

      if (code === 0) {
        finishResolve(0);
        return;
      }

      const detail = stderr.trim();
      finishReject(
        new Error(
          `Agent process error: Codex exited with code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`
        )
      );
    });

    abortController.signal.addEventListener('abort', onAbort, { once: true });
    child.stdin.end(prompt);
  });
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

interface CodexEvent {
  type: string;
  item?: CodexItem;
}

type CodexItem =
  | {
      id: string;
      type: 'agent_message';
      text?: string;
    }
  | {
      id: string;
      type: 'command_execution';
      command?: string;
      aggregated_output?: string;
      exit_code?: number | null;
      status?: string;
    }
  | {
      id: string;
      type: string;
      [key: string]: unknown;
    };

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
  event: CodexEvent,
  toolIndexFor: (itemId: string) => number,
  bus?: QuetzBus
): void {
  if (!event.item) return;

  if (event.type === 'item.started' && event.item.type === 'command_execution') {
    emitToolStart(toolIndexFor(event.item.id), 'Bash', bus);
    return;
  }

  if (event.type !== 'item.completed') return;

  switch (event.item.type) {
    case 'agent_message': {
      const item = event.item as Extract<CodexItem, { type: 'agent_message' }>;
      if (item.text) emitAgentText(item.text, bus);
      return;
    }
    case 'command_execution': {
      const item = event.item as Extract<CodexItem, { type: 'command_execution' }>;
      emitToolDone(
        toolIndexFor(item.id),
        'Bash',
        summarizeCodexCommand(item.command ?? ''),
        bus
      );
      return;
    }
    default:
      return;
  }
}

function emitAgentText(text: string, bus?: QuetzBus): void {
  if (bus) bus.emit('agent:text', { text });
  else process.stdout.write(text);
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
