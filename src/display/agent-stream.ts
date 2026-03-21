// Parses Claude Code stream-json JSONL and renders tool calls + text to stdout.

import { dim, waiting, brand } from './terminal.js';

interface BlockState {
  name: string;
  inputChunks: string[];
}

export class AgentStreamRenderer {
  private blocks = new Map<number, BlockState>();

  /** Process one JSONL line from claude --output-format stream-json */
  processLine(line: string): void {
    if (!line.trim()) return;

    let obj: any;
    try { obj = JSON.parse(line); } catch { return; }

    // Unwrap stream_event envelope
    const event = obj.type === 'stream_event' ? obj.event : obj;
    if (!event?.type) return;

    switch (event.type) {
      case 'content_block_start': {
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          this.blocks.set(event.index, {
            name: block.name,
            inputChunks: [],
          });
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'input_json_delta') {
          const block = this.blocks.get(event.index);
          if (block) block.inputChunks.push(delta.partial_json);
        } else if (delta?.type === 'text_delta' && delta.text) {
          process.stdout.write(delta.text);
        }
        break;
      }

      case 'content_block_stop': {
        const block = this.blocks.get(event.index);
        if (block) {
          const inputStr = block.inputChunks.join('');
          let input: Record<string, any> = {};
          try { input = JSON.parse(inputStr); } catch { /* partial/empty is fine */ }
          const summary = formatToolSummary(block.name, input);
          process.stdout.write(`  ${waiting('▸')} ${brand(block.name)} ${dim(summary)}\n`);
          this.blocks.delete(event.index);
        }
        break;
      }
    }
  }
}

function formatToolSummary(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'Read':
      return shortPath(String(input.file_path ?? ''));
    case 'Write':
      return shortPath(String(input.file_path ?? ''));
    case 'Edit':
      return shortPath(String(input.file_path ?? ''));
    case 'Bash':
      return truncate(String(input.command ?? ''), 60);
    case 'Glob':
      return String(input.pattern ?? '');
    case 'Grep':
      return `"${truncate(String(input.pattern ?? ''), 40)}"`;
    default: {
      // Show first string value as a hint
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
