import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter, Writable } from 'stream';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mock declaration so the module uses the mocked spawn
import * as childProcess from 'child_process';
import { spawnAgent } from '../agent.js';

const mockSpawn = vi.mocked(childProcess.spawn);

afterEach(() => {
  vi.clearAllMocks();
});

/** Create a fake writable stream that records what was written. */
function makeFakeStdin(): Writable & { written: string } {
  const chunks: string[] = [];
  const w = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
  }) as Writable & { written: string };
  Object.defineProperty(w, 'written', { get: () => chunks.join('') });
  return w;
}

function makeProc(exitCode: number | null, delayMs = 10) {
  const proc = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    stdin: Writable & { written: string };
  };
  proc.kill = vi.fn((signal: string) => {
    if (signal === 'SIGTERM') {
      setTimeout(() => proc.emit('exit', null), 5);
    }
  });
  proc.stdin = makeFakeStdin();
  setTimeout(() => proc.emit('exit', exitCode), delayMs);
  return proc as never;
}

describe('spawnAgent', () => {
  it('resolves with exit code 0 on success', async () => {
    const proc = makeProc(0);
    mockSpawn.mockReturnValue(proc);
    const code = await spawnAgent('do stuff', '/tmp', 30);
    expect(code).toBe(0);
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--model', 'sonnet', '--dangerously-skip-permissions', '-p'],
      expect.objectContaining({ cwd: '/tmp' })
    );
  });

  it('pipes prompt via stdin so long prompts are not truncated by OS arg limits', async () => {
    const proc = makeProc(0);
    mockSpawn.mockReturnValue(proc);
    const longPrompt = 'x'.repeat(50_000);
    await spawnAgent(longPrompt, '/tmp', 30);
    // stdin should contain the full prompt
    expect((proc as any).stdin.written).toBe(longPrompt);
  });

  it('inherits stdout/stderr so agent output streams to the terminal', async () => {
    mockSpawn.mockReturnValue(makeProc(0));
    await spawnAgent('do stuff', '/tmp', 30);
    const spawnOpts = mockSpawn.mock.calls[0][2] as { stdio: string[] };
    // stdin is piped, stdout and stderr are inherited
    expect(spawnOpts.stdio).toEqual(['pipe', 'inherit', 'inherit']);
  });

  it('sets shell: true on Windows so claude.cmd is resolved via cmd.exe', async () => {
    mockSpawn.mockReturnValue(makeProc(0));
    await spawnAgent('do stuff', '/tmp', 30);
    const spawnOpts = mockSpawn.mock.calls[0][2] as { shell: boolean };
    const expectedShell = process.platform === 'win32';
    expect(spawnOpts.shell).toBe(expectedShell);
  });

  it('passes --model and --dangerously-skip-permissions with -p at end', async () => {
    mockSpawn.mockReturnValue(makeProc(0));
    await spawnAgent('fix the bug', '/repo', 30, 'opus');
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--model', 'opus', '--dangerously-skip-permissions', '-p'],
      expect.any(Object)
    );
  });

  it('resolves with exit code 1 when process exits non-zero', async () => {
    mockSpawn.mockReturnValue(makeProc(1));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('resolves with 1 when exit code is null', async () => {
    mockSpawn.mockReturnValue(makeProc(null));
    expect(await spawnAgent('do stuff', '/tmp', 30)).toBe(1);
  });

  it('rejects on spawn error', async () => {
    const proc = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      stdin: Writable & { written: string };
    };
    proc.kill = vi.fn();
    proc.stdin = makeFakeStdin();
    setTimeout(() => proc.emit('error', new Error('ENOENT')), 10);
    mockSpawn.mockReturnValue(proc as never);
    await expect(spawnAgent('do stuff', '/tmp', 30)).rejects.toThrow('ENOENT');
  });
});
