import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBus } from '../events.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawnAgent } from '../agent.js';

const mockQuery = vi.mocked(query);

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/**
 * Create a mock Query async generator that yields the given messages
 * then returns. Mimics the SDK's Query object shape.
 */
function mockQueryResult(messages: any[]): any {
  async function* gen() {
    for (const msg of messages) yield msg;
  }
  return gen();
}

describe('spawnAgent', () => {
  it('resolves with exit code 0 on success', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    const code = await spawnAgent('do stuff', '/tmp', 30);
    expect(code).toBe(0);
  });

  it('passes prompt, cwd, model, and permissionMode to SDK query()', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('fix the bug', '/repo', 30, 'opus');
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'fix the bug',
      options: expect.objectContaining({
        cwd: '/repo',
        model: 'opus',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
      }),
    }));
  });

  it('handles long prompts without truncation (no OS arg-length limits with SDK)', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    const longPrompt = 'x'.repeat(50_000);
    await spawnAgent(longPrompt, '/tmp', 30);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: longPrompt })
    );
  });

  it('emits agent:text events via bus for text_delta stream events', async () => {
    const bus = createBus();
    const textHandler = vi.fn();
    bus.on('agent:text', textHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(textHandler).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('falls back to stdout.write when no bus provided', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30);
    expect(stdoutSpy).toHaveBeenCalledWith('hello');
    stdoutSpy.mockRestore();
  });

  it('emits agent:tool_start on content_block_start and agent:tool_done on content_block_stop', async () => {
    const bus = createBus();
    const startHandler = vi.fn();
    const doneHandler = vi.fn();
    bus.on('agent:tool_start', startHandler);
    bus.on('agent:tool_done', doneHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', name: 'Read' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"file_path":"/src/foo.ts"}' },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 1 },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(startHandler).toHaveBeenCalledWith({ index: 1, name: 'Read' });
    expect(doneHandler).toHaveBeenCalledWith({ index: 1, name: 'Read', summary: expect.stringContaining('src/foo.ts') });
  });

  it('reassembles chunked input_json_delta across multiple events', async () => {
    const bus = createBus();
    const doneHandler = vi.fn();
    bus.on('agent:tool_done', doneHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 2,
          content_block: { type: 'tool_use', name: 'Edit' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '{"file_' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'input_json_delta', partial_json: 'path":"/a/b/c.ts"}' },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 2 },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(doneHandler).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Edit',
      summary: expect.stringContaining('a/b/c.ts'),
    }));
  });

  it('emits agent:tool_done with Bash command summary', async () => {
    const bus = createBus();
    const doneHandler = vi.fn();
    bus.on('agent:tool_done', doneHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', name: 'Bash' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"command":"npm test"}' },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(doneHandler).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Bash',
      summary: 'npm test',
    }));
  });

  it('emits agent:tool_done with Grep quoted pattern', async () => {
    const bus = createBus();
    const doneHandler = vi.fn();
    bus.on('agent:tool_done', doneHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', name: 'Grep' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"pattern":"TODO"}' },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(doneHandler).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Grep',
      summary: '"TODO"',
    }));
  });

  it('uses default model "sonnet" when no model specified', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ model: 'sonnet' }),
      })
    );
  });

  it('resolves with exit code 1 on error result', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'] },
    ]));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('resolves with exit code 1 on max_turns error', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['max turns'] },
    ]));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('resolves with 1 when generator ends without result message', async () => {
    mockQuery.mockReturnValue(mockQueryResult([]));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('rejects with timeout error when abort fires', async () => {
    mockQuery.mockImplementation(({ options }: any) => {
      async function* gen() {
        // Simulate an agent that hangs until aborted
        await new Promise<void>((_, reject) => {
          options.abortController.signal.addEventListener('abort', () => {
            reject(new Error('The operation was aborted'));
          });
        });
      }
      return gen() as any;
    });
    // 0.0001 minutes ≈ 6ms — fires almost immediately
    await expect(spawnAgent('do stuff', '/tmp', 0.0001)).rejects.toThrow('timed out');
  });

  it('rejects on SDK query error', async () => {
    mockQuery.mockImplementation(() => { throw new Error('SDK init failed'); });
    await expect(spawnAgent('do stuff', '/tmp', 30)).rejects.toThrow('SDK init failed');
  });

  it('provides an AbortController in SDK options for process control', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30);
    const callArgs = mockQuery.mock.calls[0][0] as any;
    expect(callArgs.options.abortController).toBeInstanceOf(AbortController);
  });

  it('emits agent:stderr via bus when bus provided', async () => {
    const bus = createBus();
    const stderrHandler = vi.fn();
    bus.on('agent:stderr', stderrHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    const callArgs = mockQuery.mock.calls[0][0] as any;
    expect(typeof callArgs.options.stderr).toBe('function');
    callArgs.options.stderr('test error');
    expect(stderrHandler).toHaveBeenCalledWith({ data: 'test error' });
  });

  it('forwards stderr to process.stderr when no bus', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30);
    const callArgs = mockQuery.mock.calls[0][0] as any;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    callArgs.options.stderr('test error');
    expect(stderrSpy).toHaveBeenCalledWith('test error');
    stderrSpy.mockRestore();
  });

  it('rejects when async generator throws mid-iteration', async () => {
    const bus = createBus();
    mockQuery.mockReturnValue((async function* () {
      yield {
        type: 'stream_event',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
      };
      throw new Error('network disconnected');
    })() as any);
    await expect(spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus)).rejects.toThrow('network disconnected');
  });

  it('returns 1 when result subtype is success but is_error is true', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: true, result: '' },
    ]));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('emits agent:tool_done for unknown tool names using first string value', async () => {
    const bus = createBus();
    const doneHandler = vi.fn();
    bus.on('agent:tool_done', doneHandler);

    mockQuery.mockReturnValue(mockQueryResult([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', name: 'CustomMcpTool' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"query":"search term"}' },
        },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('do stuff', '/tmp', 30, 'sonnet', bus);
    expect(doneHandler).toHaveBeenCalledWith(expect.objectContaining({
      name: 'CustomMcpTool',
      summary: 'search term',
    }));
  });
});
