import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage, SDKPartialAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QuetzBus } from './events.js';

/**
 * Spawn a Claude Code agent via the SDK and wait for it to complete.
 *
 * @param prompt         The prompt string sent to the agent
 * @param cwd            Working directory for the agent
 * @param timeoutMinutes Kill the agent after this many minutes (default 30)
 * @param model          Claude model to use (default: sonnet)
 * @param bus            Optional event bus for streaming output
 * @returns              Resolved exit code (0 = success)
 */
export function spawnAgent(
  prompt: string,
  cwd: string,
  timeoutMinutes: number = 30,
  model: string = 'sonnet',
  bus?: QuetzBus
): Promise<number> {
  const abortController = new AbortController();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  return runQuery(prompt, cwd, model, abortController, timer, timeoutMinutes, bus);
}

async function runQuery(
  prompt: string,
  cwd: string,
  model: string,
  abortController: AbortController,
  timer: ReturnType<typeof setTimeout>,
  timeoutMinutes: number,
  bus?: QuetzBus
): Promise<number> {
  try {
    const q = query({
      prompt,
      options: {
        cwd,
        model,
        abortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
        stderr: (data: string) => {
          if (bus) bus.emit('agent:stderr', { data });
          else process.stderr.write(data);
        },
      },
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
