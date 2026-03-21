import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentStreamRenderer } from '../display/agent-stream.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    chunks.push(String(chunk));
    return true;
  });
  fn();
  spy.mockRestore();
  return chunks.join('');
}

function streamEvent(event: any): string {
  return JSON.stringify({ type: 'stream_event', event });
}

describe('AgentStreamRenderer', () => {
  it('renders tool_use with parsed input summary', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(streamEvent({
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', name: 'Read', input: {} },
      }));
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"/home/user/project/src/config.ts"}' },
      }));
      r.processLine(streamEvent({ type: 'content_block_stop', index: 0 }));
    });
    expect(output).toContain('Read');
    expect(output).toContain('src/config.ts');
  });

  it('renders Bash tool with command preview', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(streamEvent({
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', name: 'Bash', input: {} },
      }));
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"command":"npm test"}' },
      }));
      r.processLine(streamEvent({ type: 'content_block_stop', index: 0 }));
    });
    expect(output).toContain('Bash');
    expect(output).toContain('npm test');
  });

  it('renders Grep tool with quoted pattern', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(streamEvent({
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', name: 'Grep', input: {} },
      }));
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"pattern":"getReadyIssues"}' },
      }));
      r.processLine(streamEvent({ type: 'content_block_stop', index: 0 }));
    });
    expect(output).toContain('Grep');
    expect(output).toContain('getReadyIssues');
  });

  it('streams text_delta chunks immediately', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 1,
        delta: { type: 'text_delta', text: 'Analyzing the code' },
      }));
    });
    expect(output).toBe('Analyzing the code');
  });

  it('handles chunked input_json_delta across multiple events', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(streamEvent({
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', name: 'Edit', input: {} },
      }));
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"file_' },
      }));
      r.processLine(streamEvent({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: 'path":"/a/b/loop.ts"}' },
      }));
      r.processLine(streamEvent({ type: 'content_block_stop', index: 0 }));
    });
    expect(output).toContain('Edit');
    expect(output).toContain('loop.ts');
  });

  it('ignores invalid JSON lines gracefully', () => {
    const r = new AgentStreamRenderer();
    expect(() => r.processLine('not json')).not.toThrow();
    expect(() => r.processLine('')).not.toThrow();
    expect(() => r.processLine('{}')).not.toThrow();
  });

  it('handles events without stream_event envelope', () => {
    const r = new AgentStreamRenderer();
    const output = captureOutput(() => {
      r.processLine(JSON.stringify({
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', name: 'Glob', input: {} },
      }));
      r.processLine(JSON.stringify({
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"pattern":"**/*.ts"}' },
      }));
      r.processLine(JSON.stringify({ type: 'content_block_stop', index: 0 }));
    });
    expect(output).toContain('Glob');
    expect(output).toContain('**/*.ts');
  });
});
