import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentStreamRenderer } from '../display/agent-stream.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEvent(inner: Record<string, any>): string {
  return JSON.stringify({ type: 'stream_event', event: inner });
}

describe('AgentStreamRenderer', () => {
  it('renders text_delta to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();
    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hello world' },
    }));
    expect(spy).toHaveBeenCalledWith('hello world');
  });

  it('renders tool_use blocks with summary on content_block_stop', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();

    r.processLine(makeEvent({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', name: 'Read' },
    }));

    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"file_path":"/src/foo.ts"}' },
    }));

    r.processLine(makeEvent({
      type: 'content_block_stop',
      index: 1,
    }));

    // Last write should contain the tool name "Read" and short path
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain('Read');
    expect(lastCall).toContain('src/foo.ts');
  });

  it('shows truncated Bash commands', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();

    r.processLine(makeEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', name: 'Bash' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: `{"command":"npm test"}` },
    }));
    r.processLine(makeEvent({
      type: 'content_block_stop',
      index: 0,
    }));

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain('Bash');
    expect(lastCall).toContain('npm test');
  });

  it('shows Grep pattern in quotes', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();

    r.processLine(makeEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', name: 'Grep' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"pattern":"TODO"}' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_stop',
      index: 0,
    }));

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain('"TODO"');
  });

  it('handles chunked input_json_delta across multiple events', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();

    r.processLine(makeEvent({
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', name: 'Edit' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"file_' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: 'path":"/a/b/c.ts"}' },
    }));
    r.processLine(makeEvent({
      type: 'content_block_stop',
      index: 2,
    }));

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain('Edit');
    expect(lastCall).toContain('a/b/c.ts');
  });

  it('silently ignores invalid JSON lines', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();
    r.processLine('not valid json {{{');
    r.processLine('');
    r.processLine('   ');
    expect(spy).not.toHaveBeenCalled();
  });

  it('handles events without stream_event envelope', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = new AgentStreamRenderer();
    // Direct event without wrapper
    r.processLine(JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'bare event' },
    }));
    expect(spy).toHaveBeenCalledWith('bare event');
  });
});
