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
vi.mock('../ui/LaunchApp.js', () => ({
  mountLaunchApp: vi.fn(),
}));

import { createBus } from '../events.js';
import { runLoop } from '../loop.js';
import { mountApp } from '../ui/App.js';
import { mountLaunchApp } from '../ui/LaunchApp.js';
import type { LaunchSelection } from '../ui/LaunchApp.js';
import { EXIT_SUCCESS, EXIT_FAILURE, EXIT_CONFIG_ERROR, EXIT_PREFLIGHT_FAILURE, main } from '../cli.js';

const mockCreateBus = vi.mocked(createBus);
const mockRunLoop = vi.mocked(runLoop);
const mockMountApp = vi.mocked(mountApp);
const mockMountLaunchApp = vi.mocked(mountLaunchApp);

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

function stdoutText(): string {
  return stdoutSpy.mock.calls
    .map((call: Parameters<typeof process.stdout.write>) => String(call[0]))
    .join('');
}

function mockLaunchSelection(selection: Partial<LaunchSelection> = {}): void {
  mockMountLaunchApp.mockReturnValue({
    ready: Promise.resolve(),
    result: Promise.resolve({
      provider: 'claude',
      model: 'sonnet',
      effort: 'medium',
      simulate: false,
      localCommits: false,
      amend: false,
      beadsMode: 'all',
      ...selection,
    }),
    unmount: vi.fn(() => Promise.resolve()),
  } as never);
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
  it('shows the zero-arg launch screen before starting the TUI loop', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmountLaunch = vi.fn(() => Promise.resolve());
    const unmount = vi.fn(() => Promise.resolve());
    let quit!: () => void;

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0, reason: 'no_issues' } as never);
    mockMountLaunchApp.mockReturnValue({
      ready: Promise.resolve(),
      result: Promise.resolve({
        provider: 'codex',
        model: 'gpt-5-codex',
        effort: 'high',
        simulate: true,
        localCommits: true,
        amend: false,
        beadsMode: 'all',
      }),
      unmount: unmountLaunch,
    } as never);
    mockMountApp.mockImplementation((opts) => {
      quit = opts.onQuit;
      return { ready: Promise.resolve(), unmount } as never;
    });

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 80, 24);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockMountLaunchApp).toHaveBeenCalledTimes(1);
    expect(unmountLaunch).toHaveBeenCalledTimes(1);
    expect(mockMountApp).toHaveBeenCalledTimes(1);
    expect(mockRunLoop).toHaveBeenCalledWith(
      {
        provider: 'codex',
        model: 'gpt-5-codex',
        effort: 'high',
        timeout: undefined,
        localCommits: true,
        amend: false,
        simulate: true,
        customPrompt: undefined,
      },
      bus,
    );
    expect(unmount).toHaveBeenCalledTimes(1);

    const stderrOutput = stderrSpy.mock.calls
      .map((call: Parameters<typeof process.stderr.write>) => String(call[0]))
      .join('');
    expect(stderrOutput).not.toContain('Terminal too small');
    expect(stderrOutput).not.toContain('below recommended');
    expect(quit).toBeTypeOf('function');
  });

  it('exits cleanly when the launch screen is dismissed before start', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmountLaunch = vi.fn(() => Promise.resolve());

    mockCreateBus.mockReturnValue(bus as never);
    mockMountLaunchApp.mockReturnValue({
      ready: Promise.resolve(),
      result: Promise.resolve(null),
      unmount: unmountLaunch,
    } as never);

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 120, 40);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockMountLaunchApp).toHaveBeenCalledTimes(1);
    expect(unmountLaunch).toHaveBeenCalledTimes(1);
    expect(mockRunLoop).not.toHaveBeenCalled();
    expect(mockMountApp).not.toHaveBeenCalled();
  });

  it('bypasses the launch screen when explicit run flags are provided', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmount = vi.fn(() => Promise.resolve());
    let quit!: () => void;

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0, reason: 'no_issues' } as never);
    mockMountApp.mockImplementation((opts) => {
      quit = opts.onQuit;
      return { ready: Promise.resolve(), unmount } as never;
    });

    process.argv = ['node', 'quetz', 'run', '--simulate'];
    setStdoutSize(true, 80, 24);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockMountLaunchApp).not.toHaveBeenCalled();
    expect(mockMountApp).toHaveBeenCalledTimes(1);
    expect(mockRunLoop).toHaveBeenCalledWith(
      {
        model: undefined,
        effort: undefined,
        timeout: undefined,
        localCommits: false,
        amend: false,
        simulate: true,
        customPrompt: undefined,
      },
      bus,
    );
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(quit).toBeTypeOf('function');
  });

  it('parses --effort and forwards it to runLoop', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0 } as never);

    process.argv = ['node', 'quetz', 'run', '--effort', 'medium'];
    setStdoutSize(false, 120, 40);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockRunLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        effort: 'medium',
      }),
      bus,
    );
  });

  it('fails fast on an invalid --effort value', async () => {
    process.argv = ['node', 'quetz', 'run', '--effort', 'turbo'];

    await expect(main()).rejects.toMatchObject({ code: 1 });

    const stderrOutput = stderrSpy.mock.calls
      .map((call: Parameters<typeof process.stderr.write>) => String(call[0]))
      .join('');
    expect(stderrOutput).toContain('invalid --effort');
    expect(mockRunLoop).not.toHaveBeenCalled();
  });

  it('prints known models for all providers', async () => {
    process.argv = ['node', 'quetz', 'models'];

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(stdoutText()).toContain('claude: Claude Code');
    expect(stdoutText()).toContain('known:   haiku, sonnet, opus');
    expect(stdoutText()).toContain('codex: Codex SDK');
    expect(stdoutText()).toContain('known:   gpt-5-codex, gpt-5, gpt-5.1');
    expect(mockRunLoop).not.toHaveBeenCalled();
  });

  it('prints known models for one provider', async () => {
    process.argv = ['node', 'quetz', 'models', '--provider', 'codex'];

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(stdoutText()).toContain('codex: Codex SDK');
    expect(stdoutText()).not.toContain('claude: Claude Code');
    expect(stdoutText()).toContain('default: gpt-5-codex');
  });

  it('fails fast on an invalid provider for models', async () => {
    process.argv = ['node', 'quetz', 'models', '--provider', 'bad'];

    await expect(main()).rejects.toMatchObject({ code: 1 });

    const stderrOutput = stderrSpy.mock.calls
      .map((call: Parameters<typeof process.stderr.write>) => String(call[0]))
      .join('');
    expect(stderrOutput).toContain('invalid --provider');
  });

  it('still accepts --thinking-level as a compatibility alias', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0 } as never);

    process.argv = ['node', 'quetz', 'run', '--thinking-level', 'high'];
    setStdoutSize(false, 120, 40);

    await expect(main()).rejects.toMatchObject({ code: 0 });

    expect(mockRunLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        effort: 'high',
      }),
      bus,
    );
  });

  it('keeps the victory screen mounted until the user quits in TTY mode', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmount = vi.fn(() => Promise.resolve());
    let quit!: () => void;

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0, reason: 'victory' } as never);
    mockLaunchSelection();
    mockMountApp.mockImplementation((opts) => {
      quit = opts.onQuit;
      return { ready: Promise.resolve(), unmount } as never;
    });

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 120, 40);

    const mainPromise = main();
    await vi.waitFor(() => {
      expect(mockMountApp).toHaveBeenCalledTimes(1);
      expect(quit).toBeTypeOf('function');
    });

    expect(unmount).not.toHaveBeenCalled();

    quit();

    await expect(mainPromise).rejects.toMatchObject({ code: 0 });
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(stdoutText()).toContain('The serpent rests — all issues resolved.');
    expect(stdoutText()).not.toContain('interrupted by user');
  });

  it('shows the victory message when the completed screen is dismissed with Ctrl+C', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmount = vi.fn(() => Promise.resolve());

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 0, reason: 'victory' } as never);
    mockLaunchSelection();
    mockMountApp.mockReturnValue({ ready: Promise.resolve(), unmount } as never);

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 120, 40);

    const mainPromise = main();
    await vi.waitFor(() => {
      expect(mockMountApp).toHaveBeenCalledTimes(1);
    });

    process.emit('SIGINT');

    await expect(mainPromise).rejects.toMatchObject({ code: 0 });
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(stdoutText()).toContain('The serpent rests — all issues resolved.');
    expect(stdoutText()).not.toContain('interrupted by user');
  });

  it('keeps the failure screen mounted until the user quits in TTY mode', async () => {
    const bus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
    const unmount = vi.fn(() => Promise.resolve());
    let quit!: () => void;

    mockCreateBus.mockReturnValue(bus as never);
    mockRunLoop.mockResolvedValue({ exitCode: 1, reason: 'error' } as never);
    mockLaunchSelection();
    mockMountApp.mockImplementation((opts) => {
      quit = opts.onQuit;
      return { ready: Promise.resolve(), unmount } as never;
    });

    process.argv = ['node', 'quetz', 'run'];
    setStdoutSize(true, 120, 40);

    const mainPromise = main();
    await vi.waitFor(() => {
      expect(mockMountApp).toHaveBeenCalledTimes(1);
      expect(quit).toBeTypeOf('function');
    });

    expect(unmount).not.toHaveBeenCalled();

    quit();

    await expect(mainPromise).rejects.toMatchObject({ code: 1 });
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(stdoutText()).toContain('The serpent retreats (exit code 1 — runtime failure).');
    expect(stdoutText()).not.toContain('interrupted by user');
  });
});
