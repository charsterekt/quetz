import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBus } from '../events.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));
vi.mock('../codex-sdk.js', () => ({
  loadCodexSdk: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { loadCodexSdk } from '../codex-sdk.js';
import { spawnAgent } from '../agent.js';

const mockQuery = vi.mocked(query);
const mockLoadCodexSdk = vi.mocked(loadCodexSdk);

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete process.env['OPENAI_API_KEY'];
  delete process.env['CODEX_API_KEY'];
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

function createMockCodexThread(events: any[] = []) {
  return {
    runStreamed: vi.fn(async () => ({ events: mockQueryResult(events) })),
  };
}

function mockCodexRuntime(thread: ReturnType<typeof createMockCodexThread>) {
  const startThread = vi.fn(() => thread);
  const Codex = vi.fn(function MockCodex() {
    return { startThread };
  });
  mockLoadCodexSdk.mockResolvedValue({ Codex } as never);
  return { Codex, startThread };
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

  it('passes Claude effort when an effort level is provided', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));
    await spawnAgent('fix the bug', '/repo', 30, 'opus', undefined, 'medium');
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        model: 'opus',
        effort: 'medium',
      }),
    }));
  });

  it('uses SDK isolation and a read-only toolset in simulate mode', async () => {
    mockQuery.mockReturnValue(mockQueryResult([
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]));

    await spawnAgent('inspect only', '/repo', 30, 'sonnet', undefined, 'medium', true);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        permissionMode: 'dontAsk',
        settingSources: [],
        tools: ['Read', 'Glob', 'Grep'],
        allowedTools: ['Read', 'Glob', 'Grep'],
      }),
    }));

    const callArgs = mockQuery.mock.calls[0][0] as any;
    expect(callArgs.options.allowDangerouslySkipPermissions).toBeUndefined();
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

  it('dispatches Codex runs through the Codex SDK runtime', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-openai-test';
    const thread = createMockCodexThread([
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Done' } },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    const { Codex, startThread } = mockCodexRuntime(thread);

    await expect(
      spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', createBus(), 'medium', false, 'codex', {
        baseUrl: 'https://api.example.test/v1',
      })
    ).resolves.toBe(0);

    expect(Codex).toHaveBeenCalledWith({
      apiKey: expect.any(String),
      baseUrl: 'https://api.example.test/v1',
    });
    expect(startThread).toHaveBeenCalledWith({
      approvalPolicy: 'never',
      model: 'gpt-5-codex',
      modelReasoningEffort: 'medium',
      sandboxMode: 'danger-full-access',
      workingDirectory: '/tmp',
    });
    expect(thread.runStreamed).toHaveBeenCalledWith('do stuff', {
      signal: expect.any(AbortSignal),
    });
  });

  it('uses a read-only Codex sandbox in simulate mode', async () => {
    const thread = createMockCodexThread([
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    const { startThread } = mockCodexRuntime(thread);

    await expect(
      spawnAgent('inspect only', '/repo', 30, 'gpt-5-codex', createBus(), 'max', true, 'codex')
    ).resolves.toBe(0);

    expect(startThread).toHaveBeenCalledWith({
      approvalPolicy: 'never',
      model: 'gpt-5-codex',
      modelReasoningEffort: 'xhigh',
      networkAccessEnabled: false,
      sandboxMode: 'read-only',
      workingDirectory: '/repo',
    });
  });

  it('normalizes Codex command_execution items into tool events', async () => {
    const bus = createBus();
    const startHandler = vi.fn();
    const doneHandler = vi.fn();
    bus.on('agent:tool_start', startHandler);
    bus.on('agent:tool_done', doneHandler);

    const thread = createMockCodexThread([
      {
        type: 'item.started',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '"C:\\\\windows\\\\system32\\\\windowspowershell\\\\v1.0\\\\powershell.exe" -Command "Get-ChildItem -Name"',
          aggregated_output: '',
          status: 'in_progress',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '"C:\\\\windows\\\\system32\\\\windowspowershell\\\\v1.0\\\\powershell.exe" -Command "Get-ChildItem -Name"',
          aggregated_output: 'src',
          exit_code: 0,
          status: 'completed',
        },
      },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', bus, 'medium', false, 'codex')).resolves.toBe(0);
    expect(startHandler).toHaveBeenCalledWith({ index: 0, name: 'Bash' });
    expect(doneHandler).toHaveBeenCalledWith({ index: 0, name: 'Bash', summary: 'Get-ChildItem -Name' });
  });

  it('emits incremental stderr deltas for Codex command_execution updates without duplicating completion output', async () => {
    const bus = createBus();
    const stderrHandler = vi.fn();
    bus.on('agent:stderr', stderrHandler);

    const thread = createMockCodexThread([
      {
        type: 'item.started',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: '',
          status: 'in_progress',
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'hello',
          status: 'in_progress',
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'hello world',
          status: 'in_progress',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'hello world',
          exit_code: 0,
          status: 'completed',
        },
      },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', bus, 'medium', false, 'codex')).resolves.toBe(0);
    expect(stderrHandler).toHaveBeenNthCalledWith(1, { data: 'hello' });
    expect(stderrHandler).toHaveBeenNthCalledWith(2, { data: ' world' });
    expect(stderrHandler).toHaveBeenCalledTimes(2);
  });

  it('falls back to full Codex command_execution output when aggregated_output is replaced', async () => {
    const bus = createBus();
    const stderrHandler = vi.fn();
    bus.on('agent:stderr', stderrHandler);

    const thread = createMockCodexThread([
      {
        type: 'item.started',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: '',
          status: 'in_progress',
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'abc',
          status: 'in_progress',
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'abX',
          status: 'in_progress',
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'abXYZ',
          status: 'in_progress',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: 'bash -lc "echo hello"',
          aggregated_output: 'abXYZ',
          exit_code: 0,
          status: 'completed',
        },
      },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', bus, 'medium', false, 'codex')).resolves.toBe(0);
    expect(stderrHandler).toHaveBeenNthCalledWith(1, { data: 'abc' });
    expect(stderrHandler).toHaveBeenNthCalledWith(2, { data: 'abX' });
    expect(stderrHandler).toHaveBeenNthCalledWith(3, { data: 'YZ' });
    expect(stderrHandler).toHaveBeenCalledTimes(3);
  });

  it('emits Codex agent_message items through agent:text', async () => {
    const bus = createBus();
    const textHandler = vi.fn();
    bus.on('agent:text', textHandler);

    const thread = createMockCodexThread([
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'OK' } },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', bus, 'medium', false, 'codex')).resolves.toBe(0);
    expect(textHandler).toHaveBeenCalledWith({ text: 'OK' });
  });

  it('emits Codex error items through agent:stderr', async () => {
    const bus = createBus();
    const stderrHandler = vi.fn();
    bus.on('agent:stderr', stderrHandler);

    const thread = createMockCodexThread([
      {
        type: 'item.completed',
        item: {
          id: 'item_2',
          type: 'error',
          message: 'tests failed',
        },
      },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', bus, 'medium', false, 'codex')).resolves.toBe(0);
    expect(stderrHandler).toHaveBeenCalledWith({ data: 'tests failed' });
  });

  it('rejects when the Codex SDK stream fails the turn', async () => {
    const thread = createMockCodexThread([
      { type: 'turn.failed', error: { message: 'stream broke' } },
    ]);
    mockCodexRuntime(thread);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', createBus(), 'medium', false, 'codex')).rejects.toThrow('stream broke');
  });

  it('rejects when the Codex SDK runtime throws before streaming starts', async () => {
    const Codex = vi.fn(function MockCodex() {
      return {
        startThread: vi.fn(() => ({
          runStreamed: vi.fn(async () => {
            throw new Error('invalid payload from runtime');
          }),
        })),
      };
    });
    mockLoadCodexSdk.mockResolvedValue({ Codex } as never);

    await expect(spawnAgent('do stuff', '/tmp', 30, 'gpt-5-codex', undefined, 'medium', false, 'codex')).rejects.toThrow('invalid payload from runtime');
  });
});
