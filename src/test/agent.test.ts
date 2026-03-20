import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

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

function makeProc(exitCode: number | null, delayMs = 10) {
  const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
  proc.kill = vi.fn((signal: string) => {
    // When killed, emit exit after a short delay
    if (signal === 'SIGTERM') {
      setTimeout(() => proc.emit('exit', null), 5);
    }
  });
  setTimeout(() => proc.emit('exit', exitCode), delayMs);
  return proc as never;
}

describe('spawnAgent', () => {
  it('resolves with exit code 0 on success', async () => {
    mockSpawn.mockReturnValue(makeProc(0));
    const code = await spawnAgent('do stuff', '/tmp', 30);
    expect(code).toBe(0);
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['-p', 'do stuff', '--model', 'sonnet', '--dangerously-skip-permissions'],
      expect.objectContaining({ stdio: 'inherit', cwd: '/tmp' })
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
    const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    proc.kill = vi.fn();
    setTimeout(() => proc.emit('error', new Error('ENOENT')), 10);
    mockSpawn.mockReturnValue(proc as never);
    await expect(spawnAgent('do stuff', '/tmp', 30)).rejects.toThrow('ENOENT');
  });
});
