import { describe, it, expect, vi } from 'vitest';
import { QuetzBus, createBus } from '../events.js';

describe('QuetzBus', () => {
  it('createBus returns a QuetzBus instance', () => {
    const bus = createBus();
    expect(bus).toBeInstanceOf(QuetzBus);
  });

  it('emits and receives loop:start events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:start', handler);
    bus.emit('loop:start', { total: 5 });
    expect(handler).toHaveBeenCalledWith({ total: 5 });
  });

  it('emits and receives loop:issue_pickup events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:issue_pickup', handler);
    const payload = { id: 'quetz-abc', title: 'Fix bug', priority: 1, type: 'bug', iteration: 1, total: 5 };
    bus.emit('loop:issue_pickup', payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('emits and receives loop:phase events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:phase', handler);
    bus.emit('loop:phase', { phase: 'agent_running', detail: 'model=sonnet' });
    expect(handler).toHaveBeenCalledWith({ phase: 'agent_running', detail: 'model=sonnet' });
  });

  it('emits and receives agent:text events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('agent:text', handler);
    bus.emit('agent:text', { text: 'hello world' });
    expect(handler).toHaveBeenCalledWith({ text: 'hello world' });
  });

  it('emits and receives agent:tool_done events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('agent:tool_done', handler);
    bus.emit('agent:tool_done', { index: 0, name: 'Read', summary: 'src/foo.ts' });
    expect(handler).toHaveBeenCalledWith({ index: 0, name: 'Read', summary: 'src/foo.ts' });
  });

  it('emits and receives agent:stderr events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('agent:stderr', handler);
    bus.emit('agent:stderr', { data: 'warning message' });
    expect(handler).toHaveBeenCalledWith({ data: 'warning message' });
  });

  it('emits and receives loop:victory events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:victory', handler);
    const payload = { issuesCompleted: 3, totalTime: '5m 30s', prsMerged: 3, mode: 'pr' };
    bus.emit('loop:victory', payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('emits and receives loop:failure events', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('loop:failure', handler);
    bus.emit('loop:failure', { reason: 'ci_failed', prNumber: 42, prUrl: 'https://gh/pr/42' });
    expect(handler).toHaveBeenCalledWith({ reason: 'ci_failed', prNumber: 42, prUrl: 'https://gh/pr/42' });
  });

  it('once listener fires only once', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.once('loop:start', handler);
    bus.emit('loop:start', { total: 1 });
    bus.emit('loop:start', { total: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ total: 1 });
  });

  it('off removes listener', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('agent:text', handler);
    bus.off('agent:text', handler);
    bus.emit('agent:text', { text: 'ignored' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple listeners on same event all fire', () => {
    const bus = createBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('loop:warning', h1);
    bus.on('loop:warning', h2);
    bus.emit('loop:warning', { message: 'heads up' });
    expect(h1).toHaveBeenCalledWith({ message: 'heads up' });
    expect(h2).toHaveBeenCalledWith({ message: 'heads up' });
  });
});
