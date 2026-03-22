import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { createBus } from '../../events.js';
import type { QuetzBus } from '../../events.js';

let render: (node: React.ReactElement) => any;
let App: React.FC<{ bus: QuetzBus; onQuit?: () => void }>;
let initInk: () => Promise<any>;

async function waitForRender() {
  await new Promise(resolve => setTimeout(resolve, 50));
}

beforeAll(async () => {
  const itl = await import('ink-testing-library');
  render = itl.render;

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

  it('renders dashboard keyboard hints by default', () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    const output = instance.lastFrame();
    expect(output).toContain('q quit');
    expect(output).toContain('h runs');
    expect(output).toContain('[ ] log');
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
    await waitForRender();
    bus.emit('loop:issue_pickup', { id: 'bd-abc', title: 'Fix auth', priority: 1, type: 'bug', iteration: 1, total: 5 });
    await waitForRender();
    const output = instance.lastFrame();
    expect(output).toContain('PICKUP');
    expect(output).toContain('bd-abc');
    instance.unmount();
  });

  it('shows agent text in agent panel when event emitted', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();
    bus.emit('agent:text', { text: 'Reading file...\n' });
    await waitForRender();
    const output = instance.lastFrame();
    expect(output).toContain('Reading file');
    instance.unmount();
  });

  it('shows tool done in agent panel', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();
    bus.emit('agent:tool_done', { index: 0, name: 'Read', summary: 'src/foo.ts' });
    await waitForRender();
    const output = instance.lastFrame();
    expect(output).toContain('Read');
    expect(output).toContain('src/foo.ts');
    instance.unmount();
  });

  it('resets agent output and header state when a new issue is picked up', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'quetz-1', title: 'First issue', priority: 1, type: 'feature', iteration: 1, total: 2 });
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'sonnet' });
    bus.emit('agent:text', { text: 'Old output line\n' });
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'quetz-2', title: 'Second issue', priority: 1, type: 'feature', iteration: 2, total: 2 });
    await waitForRender();

    const output = instance.lastFrame();
    expect(output).toContain('Agent: quetz-2');
    expect(output).not.toContain('Old output line');
    expect(output).not.toContain('sonnet');
    instance.unmount();
  });

  it('keeps the agent header visible after moving into polling phases', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'mock-003', title: 'Create mock output c', priority: 2, type: 'chore', iteration: 3, total: 3 });
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'sonnet' });
    await waitForRender();

    bus.emit('loop:phase', { phase: 'pr_detecting' });
    bus.emit('loop:phase', { phase: 'pr_polling' });
    await waitForRender();

    const output = instance.lastFrame();
    expect(output).toContain('Agent: mock-003');
    instance.unmount();
  });

  it('opens recent runs view and shows completed sessions', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'quetz-1', title: 'Build history', priority: 1, type: 'feature', iteration: 1, total: 2 });
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'sonnet' });
    bus.emit('agent:text', { text: 'Done\n' });
    bus.emit('loop:merged', { prNumber: 101, issueId: 'quetz-1', remaining: 1 });
    await waitForRender();

    instance.stdin.write('h');
    await waitForRender();

    const output = instance.lastFrame();
    expect(output).toContain('Recent Runs');
    expect(output).toContain('quetz-1');
    expect(output).toContain('Build history');
    instance.unmount();
  });

  it('opens run detail and returns to the dashboard without losing loop state', async () => {
    const bus = createBus();
    const instance = render(React.createElement(App, { bus }));
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'quetz-1', title: 'Build history', priority: 1, type: 'feature', iteration: 1, total: 2 });
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'sonnet' });
    bus.emit('agent:tool_done', { index: 0, name: 'Read', summary: 'src/ui/App.tsx' });
    bus.emit('agent:text', { text: 'Investigating layout\nFinalizing browser' });
    bus.emit('loop:merged', { prNumber: 101, issueId: 'quetz-1', remaining: 1 });
    await waitForRender();

    bus.emit('loop:issue_pickup', { id: 'quetz-2', title: 'Current live issue', priority: 1, type: 'feature', iteration: 2, total: 2 });
    bus.emit('agent:text', { text: 'Still running live work\n' });
    await waitForRender();

    instance.stdin.write('h');
    await waitForRender();
    instance.stdin.write('\r');
    await waitForRender();

    let output = instance.lastFrame();
    expect(output).toContain('Run Detail');
    expect(output).toContain('Investigating layout');
    expect(output).toContain('Read');
    expect(output).not.toContain('enter open');

    instance.stdin.write('\x1B');
    await waitForRender();
    output = instance.lastFrame();
    expect(output).toContain('Recent Runs');
    expect(output).toContain('Agent: quetz-2');

    instance.stdin.write('\x1B');
    await waitForRender();
    output = instance.lastFrame();
    expect(output).toContain('Quetz Log');
    expect(output).toContain('PICKUP');
    expect(output).toContain('quetz-2');
    instance.unmount();
  });
});
