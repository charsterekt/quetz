import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { createBus } from '../../events.js';
import type { QuetzBus } from '../../events.js';

// ink and ink-testing-library are ESM-only; load via dynamic import
let render: (node: React.ReactElement) => any;
let cleanup: () => void;
let App: React.FC<{ bus: QuetzBus; onQuit?: () => void }>;
let initInk: () => Promise<any>;

beforeAll(async () => {
  const itl = await import('ink-testing-library');
  render = itl.render;
  cleanup = itl.cleanup;

  const inkImports = await import('../../ui/ink-imports.js');
  initInk = inkImports.initInk;
  await initInk();

  const appMod = await import('../../ui/App.js');
  App = appMod.App;
});

describe('App', () => {
  it('renders title bar with QUETZ branding', () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    const output = instance.lastFrame();
    expect(output).toContain('QUETZ');
    expect(output).toContain('Feathered Serpent');
    instance.unmount();
  });

  it('renders keyboard hints', () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    const output = instance.lastFrame();
    expect(output).toContain('q quit');
    expect(output).toContain('p pause');
    instance.unmount();
  });

  it('renders Agent Output and Quetz Log panel headers', () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    const output = instance.lastFrame();
    expect(output).toContain('Agent Output');
    expect(output).toContain('Quetz Log');
    instance.unmount();
  });

  it('shows issue pickup in quetz panel when event emitted', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    bus.emit('loop:issue_pickup', { id: 'bd-abc', title: 'Fix auth', priority: 1, type: 'bug', iteration: 1, total: 5 });
    // Allow React to re-render
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('PICKUP');
    expect(output).toContain('bd-abc');
    instance.unmount();
  });

  it('shows agent text in agent panel when event emitted', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    bus.emit('agent:text', { text: 'Reading file...' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('Reading file');
    instance.unmount();
  });

  it('shows tool done in agent panel', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    bus.emit('agent:tool_done', { index: 0, name: 'Read', summary: 'src/foo.ts' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('[Read]');
    expect(output).toContain('src/foo.ts');
    instance.unmount();
  });
});
