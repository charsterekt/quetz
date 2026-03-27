import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  SDKMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  SettingSource,
} from '@anthropic-ai/claude-agent-sdk';
import type { QuetzBus } from './events.js';
import type { ClaudeEffortLevel } from './config.js';

const SIMULATE_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];
const DEFAULT_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];
const SIMULATE_SETTING_SOURCES: SettingSource[] = [];

/**
 * Spawn a Claude Code agent via the SDK and wait for it to complete.
 *
 * @param prompt         The prompt string sent to the agent
 * @param cwd            Working directory for the agent
 * @param timeoutMinutes Kill the agent after this many minutes (default 30)
 * @param model          Claude model to use (default: sonnet)
 * @param bus            Optional event bus for streaming output
 * @param effort         Optional Claude effort level override
 * @param simulate       If true, restrict destructive tools (no file writes, git mutations, or GitHub ops)
 * @returns              Resolved exit code (0 = success)
 */
export function spawnAgent(
  prompt: string,
  cwd: string,
  timeoutMinutes: number = 30,
  model: string = 'sonnet',
  bus?: QuetzBus,
  effort?: ClaudeEffortLevel,
  simulate: boolean = false
): Promise<number> {
  const abortController = new AbortController();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  return runQuery(prompt, cwd, model, abortController, timer, timeoutMinutes, bus, effort, simulate);
}

async function runQuery(
  prompt: string,
  cwd: string,
  model: string,
  abortController: AbortController,
  timer: ReturnType<typeof setTimeout>,
  timeoutMinutes: number,
  bus?: QuetzBus,
  effort?: ClaudeEffortLevel,
  simulate: boolean = false
): Promise<number> {
  try {
    const options: Options = simulate
      ? {
          cwd,
          model,
          abortController,
          permissionMode: 'dontAsk' as const,
          systemPrompt: { type: 'preset' as const, preset: 'claude_code' as const },
          settingSources: SIMULATE_SETTING_SOURCES,
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
          settingSources: DEFAULT_SETTING_SOURCES,
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
        const res = message as SDKResultMessage;
        return res.subtype === 'success' && !res.is_error ? 0 : 1;
      }
    }

    // Generator ended without a result message
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

// ── Stream rendering (replaces AgentStreamRenderer) ─────────────────────────

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
        let input: Record<string, any> = {};
        try { input = JSON.parse(inputStr); } catch { /* partial/empty is fine */ }
        const summary = formatToolSummary(block.name, input);
        if (bus) bus.emit('agent:tool_done', { index: event.index, name: block.name, summary });
        else process.stdout.write(`  [${block.name}] ${summary}\n`);
        blocks.delete(event.index);
      }
      break;
    }
  }
}

function formatToolSummary(name: string, input: Record<string, any>): string {
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
      const firstVal = Object.values(input).find(v => typeof v === 'string');
      return firstVal ? truncate(String(firstVal), 50) : '';
    }
  }
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
