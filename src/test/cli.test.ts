import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../events.js', () => ({
  createBus: vi.fn(),
}));
vi.mock('../loop.js', () => ({
  runLoop: vi.fn(),
  showStatus: vi.fn(),
}));
vi.mock('../ui/App.js', () => ({
  mountApp: vi.fn(),
}));

import { createBus } from '../events.js';
import { runLoop } from '../loop.js';
import { mountApp } from '../ui/App.js';
import { EXIT_SUCCESS, EXIT_FAILURE, EXIT_CONFIG_ERROR, EXIT_PREFLIGHT_FAILURE, main } from '../cli.js';

const mockCreateBus = vi.mocked(createBus);
const mockRunLoop = vi.mocked(runLoop);
const mockMountApp = vi.mocked(mountApp);

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let originalArgv: string[];
const stdoutDescriptors = {
  isTTY: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
  columns: Object.getOwnPropertyDescriptor(process.stdout, 'columns'),
  rows: Object.getOwnPropertyDescriptor(process.stdout, 'rows'),
};

function setStdoutSize(isTTY: boolean, columns: number, rows: number): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true });
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true });
}

function restoreStdoutDescriptors(): void {
  for (const [key, descriptor] of Object.entries(stdoutDescriptors)) {
    if (descriptor) {
      Object.defineProperty(process.stdout, key, descriptor);
    } else {
      delete (process.stdout as unknown as Record<string, unknown>)[key];
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  originalArgv = [...process.argv];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code);
  }) as never);
});

afterEach(() => {
  process.argv = originalArgv;
  restoreStdoutDescriptors();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('exit codes', () => {
  it('exports correct exit code constants per spec section 7.4', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_FAILURE).toBe(1);
    expect(EXIT_CONFIG_ERROR).toBe(2);
    expect(EXIT_PREFLIGHT_FAILURE).toBe(3);
  });
});

describe('main', () => {
  it('launches the TUI on small terminals without warning or blocking', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmount = vi.fn();

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0 } as never);
    mockMountApp.mockReturnValue({ unmount } as never);

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 80, 24);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockMountApp).toHaveBeenCalledTimes(1);
    expect(mockRunLoop).toHaveBeenCalledWith(
      {
        model: undefined,
        thinkingLevel: undefined,
        timeout: undefined,
        localCommits: false,
        amend: false,
        simulate: false,
      },
      bus,
    );
    expect(unmount).toHaveBeenCalledTimes(1);

    const stderrOutput = stderrSpy.mock.calls
      .map((call: Parameters<typeof process.stderr.write>) => String(call[0]))
      .join('');
    expect(stderrOutput).not.toContain('Terminal too small');
    expect(stderrOutput).not.toContain('below recommended');
  });

  it('parses --thinking-level and forwards it to runLoop', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0 } as never);

    process.argv = ['node', 'quetz', 'run', '--thinking-level', 'medium'];
    setStdoutSize(false, 120, 40);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockRunLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        thinkingLevel: 'medium',
      }),
      bus,
    );
  });

  it('fails fast on an invalid --thinking-level value', async () => {
    process.argv = ['node', 'quetz', 'run', '--thinking-level', 'turbo'];

    await expect(main()).rejects.toMatchObject({ code: 1 });

    const stderrOutput = stderrSpy.mock.calls
      .map((call: Parameters<typeof process.stderr.write>) => String(call[0]))
      .join('');
    expect(stderrOutput).toContain('invalid --thinking-level');
    expect(mockRunLoop).not.toHaveBeenCalled();
  });
});
