import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { createBus } from '../../events.js';
import type { QuetzBus } from '../../events.js';

let render: (node: React.ReactElement) => any;
let cleanup: () => void;
let StatusBar: React.FC<{ bus: QuetzBus }>;
let initInk: () => Promise<any>;

beforeAll(async () => {
  const itl = await import('ink-testing-library');
  render = itl.render;
  cleanup = itl.cleanup;

  const inkImports = await import('../../ui/ink-imports.js');
  initInk = inkImports.initInk;
  await initInk();

  const mod = await import('../../ui/StatusBar.js');
  StatusBar = mod.StatusBar;
});

describe('StatusBar', () => {
  it('renders default idle state', () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    const output = instance.lastFrame();
    expect(output).toContain('Issue 0/0');
    expect(output).toContain('idle');
    expect(output).toContain('PR');
    expect(output).toContain('---');
    instance.unmount();
  });

  it('updates issue info on loop:issue_pickup', async () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    await new Promise(r => setTimeout(r, 50));
    bus.emit('loop:issue_pickup', { id: 'bd-xyz', title: 'Add tests', priority: 2, type: 'chore', iteration: 3, total: 10 });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('Issue 3/10');
    expect(output).toContain('bd-xyz');
    instance.unmount();
  });

  it('updates phase on loop:phase', async () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    await new Promise(r => setTimeout(r, 50));
    bus.emit('loop:phase', { phase: 'agent_running' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('agent running');
    instance.unmount();
  });

  it('shows PR number on loop:pr_found', async () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    await new Promise(r => setTimeout(r, 50));
    bus.emit('loop:pr_found', { number: 42, title: 'Fix auth', url: 'https://github.com/test/pr/42' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('#42');
    instance.unmount();
  });

  it('shows COMMIT label in commit mode', async () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    await new Promise(r => setTimeout(r, 50));
    bus.emit('loop:mode', { mode: 'commit' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('COMMIT');
    expect(output).not.toContain('PR:');
    instance.unmount();
  });

  it('shows AMEND label in amend mode', async () => {
    const bus = createBus();
    const instance = render(React.createElement(StatusBar, { bus }));
    await new Promise(r => setTimeout(r, 50));
    bus.emit('loop:mode', { mode: 'amend' });
    await new Promise(r => setTimeout(r, 50));
    const output = instance.lastFrame();
    expect(output).toContain('AMEND');
    expect(output).not.toContain('PR:');
    instance.unmount();
  });
});
