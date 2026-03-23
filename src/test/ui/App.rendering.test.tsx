import { PassThrough } from 'stream';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import ansiEscapes from 'ansi-escapes';
import { createBus } from '../../events.js';
import type { QuetzBus } from '../../events.js';

let App: React.FC<{ bus: QuetzBus; onQuit?: () => void; cwd?: string; branch?: string; version?: string }>;
let inkRender: (node: React.ReactElement, options?: Record<string, unknown>) => { unmount: () => void };

const stdoutDescriptors = {
  isTTY: Object.getOwnPropertyDescriptor(process.stdout, 'isTTY'),
  columns: Object.getOwnPropertyDescriptor(process.stdout, 'columns'),
  rows: Object.getOwnPropertyDescriptor(process.stdout, 'rows'),
};

class MemoryTTY extends PassThrough {
  isTTY = true;
  columns: number;
  rows: number;
  output = '';
  writes: string[] = [];

  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
    this.on('data', chunk => {
      const text = chunk.toString();
      this.output += text;
      this.writes.push(text);
    });
  }

  reset(): void {
    this.output = '';
    this.writes = [];
  }
}

class MemoryInput extends PassThrough {
  isTTY = true;

  setRawMode(): void {}

  resume(): this {
    return this;
  }
}

function setStdoutSize(columns: number, rows: number): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
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

async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 60));
}

beforeAll(async () => {
  const inkImports = await import('../../ui/ink-imports.js');
  await inkImports.initInk();
  inkRender = inkImports.ink().render;

  const appMod = await import('../../ui/App.js');
  App = appMod.App;
});

afterEach(() => {
  restoreStdoutDescriptors();
});

describe('App Ink rendering', () => {
  it('avoids Ink clearTerminal fallback during normal rerenders', async () => {
    const stdout = new MemoryTTY(120, 40);
    const stdin = new MemoryInput();
    const bus = createBus();

    setStdoutSize(120, 40);

    const instance = inkRender(
      React.createElement(App, { bus, cwd: 'C:/dev/quetz', branch: 'fix/remove-terminal-size-gate', version: '0.1.0' }),
      {
        stdout,
        stderr: stdout,
        stdin,
        exitOnCtrlC: false,
        patchConsole: false,
      },
    );

    await waitForRender();
    bus.emit('loop:issue_pickup', { id: 'quetz-64n', title: 'Investigate flicker', priority: 1, type: 'bug', iteration: 1, total: 1 });
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'sonnet' });
    bus.emit('agent:text', { text: 'Inspecting render path\n' });
    await waitForRender();

    instance.unmount();
    await waitForRender();

    expect(stdout.output).not.toContain(ansiEscapes.clearTerminal);
  });

  it('stays idle without periodic repaint writes', async () => {
    const stdout = new MemoryTTY(120, 40);
    const stdin = new MemoryInput();
    const bus = createBus();

    const instance = inkRender(
      React.createElement(App, { bus }),
      {
        stdout,
        stderr: stdout,
        stdin,
        exitOnCtrlC: false,
        patchConsole: false,
      },
    );

    await waitForRender();
    stdout.reset();

    await new Promise(resolve => setTimeout(resolve, 1200));

    instance.unmount();
    await waitForRender();

    expect(stdout.writes).toEqual([]);
  });
});
