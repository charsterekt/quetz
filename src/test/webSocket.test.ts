import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerConnection,
  removeConnection,
  addListener,
  getConnectionCount,
  getConnectionRecord,
  closeAll,
  pruneStale,
} from '../webSocket.js';

function makeSocket(readyState = 1): {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  readyState: number;
  emit: (event: string, ...args: any[]) => void;
  _listeners: Map<string, Set<(...args: any[]) => void>>;
} {
  const _listeners = new Map<string, Set<(...args: any[]) => void>>();

  const on = vi.fn((event: string, listener: (...args: any[]) => void) => {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event)!.add(listener);
  });

  const off = vi.fn((event: string, listener: (...args: any[]) => void) => {
    _listeners.get(event)?.delete(listener);
  });

  const emit = (event: string, ...args: any[]) => {
    for (const fn of _listeners.get(event) ?? []) {
      fn(...args);
    }
  };

  return { on, off, readyState, emit, _listeners };
}

describe('webSocket module', () => {
  beforeEach(() => {
    closeAll();
  });

  describe('registerConnection', () => {
    it('should register a connection and return an ID', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      expect(id).toBeTruthy();
      expect(getConnectionCount()).toBe(1);
    });

    it('should attach close and error listeners to the socket', () => {
      const socket = makeSocket();
      registerConnection(socket);
      expect(socket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should assign unique IDs to each connection', () => {
      const s1 = makeSocket();
      const s2 = makeSocket();
      const id1 = registerConnection(s1);
      const id2 = registerConnection(s2);
      expect(id1).not.toBe(id2);
    });

    it('should store connectedAt timestamp', () => {
      const before = Date.now();
      const socket = makeSocket();
      const id = registerConnection(socket);
      const after = Date.now();
      const record = getConnectionRecord(id);
      expect(record?.connectedAt).toBeGreaterThanOrEqual(before);
      expect(record?.connectedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('removeConnection', () => {
    it('should remove the connection from the registry', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      removeConnection(id);
      expect(getConnectionCount()).toBe(0);
      expect(getConnectionRecord(id)).toBeUndefined();
    });

    it('should remove all tracked event listeners from the socket', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      removeConnection(id);
      // off should have been called for close and error listeners
      expect(socket.off).toHaveBeenCalledWith('close', expect.any(Function));
      expect(socket.off).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should be idempotent (safe to call multiple times)', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      removeConnection(id);
      expect(() => removeConnection(id)).not.toThrow();
      expect(getConnectionCount()).toBe(0);
    });

    it('should not affect other connections', () => {
      const s1 = makeSocket();
      const s2 = makeSocket();
      const id1 = registerConnection(s1);
      registerConnection(s2);
      removeConnection(id1);
      expect(getConnectionCount()).toBe(1);
    });
  });

  describe('auto-cleanup on close event', () => {
    it('should remove connection when socket emits close', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      expect(getConnectionCount()).toBe(1);
      socket.emit('close');
      expect(getConnectionCount()).toBe(0);
      expect(getConnectionRecord(id)).toBeUndefined();
    });

    it('should remove connection when socket emits error', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      socket.emit('error', new Error('connection reset'));
      expect(getConnectionCount()).toBe(0);
      expect(getConnectionRecord(id)).toBeUndefined();
    });

    it('should remove all custom listeners on close', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      const msgListener = vi.fn();
      addListener(id, 'message', msgListener);
      socket.emit('close');
      // After close, the message listener should have been removed
      expect(socket.off).toHaveBeenCalledWith('message', msgListener);
    });
  });

  describe('addListener', () => {
    it('should attach a listener to an active connection', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      const listener = vi.fn();
      const result = addListener(id, 'message', listener);
      expect(result).toBe(true);
      expect(socket.on).toHaveBeenCalledWith('message', listener);
    });

    it('should return false for unknown connection IDs', () => {
      const listener = vi.fn();
      expect(addListener('nonexistent', 'message', listener)).toBe(false);
    });

    it('should replace existing listener for the same event', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      addListener(id, 'message', listener1);
      addListener(id, 'message', listener2);
      // Old listener should be removed, new one added
      expect(socket.off).toHaveBeenCalledWith('message', listener1);
      expect(socket.on).toHaveBeenCalledWith('message', listener2);
    });

    it('should track custom listener for cleanup on disconnect', () => {
      const socket = makeSocket();
      const id = registerConnection(socket);
      const listener = vi.fn();
      addListener(id, 'message', listener);
      removeConnection(id);
      expect(socket.off).toHaveBeenCalledWith('message', listener);
    });
  });

  describe('getConnectionCount', () => {
    it('should return 0 when no connections are active', () => {
      expect(getConnectionCount()).toBe(0);
    });

    it('should track count accurately across register and remove', () => {
      const s1 = makeSocket();
      const s2 = makeSocket();
      const s3 = makeSocket();
      const id1 = registerConnection(s1);
      registerConnection(s2);
      registerConnection(s3);
      expect(getConnectionCount()).toBe(3);
      removeConnection(id1);
      expect(getConnectionCount()).toBe(2);
    });
  });

  describe('closeAll', () => {
    it('should remove all active connections', () => {
      registerConnection(makeSocket());
      registerConnection(makeSocket());
      registerConnection(makeSocket());
      expect(getConnectionCount()).toBe(3);
      closeAll();
      expect(getConnectionCount()).toBe(0);
    });

    it('should remove listeners from all sockets', () => {
      const s1 = makeSocket();
      const s2 = makeSocket();
      registerConnection(s1);
      registerConnection(s2);
      closeAll();
      expect(s1.off).toHaveBeenCalled();
      expect(s2.off).toHaveBeenCalled();
    });

    it('should be safe when no connections exist', () => {
      expect(() => closeAll()).not.toThrow();
    });
  });

  describe('pruneStale', () => {
    it('should remove connections with CLOSING readyState (2)', () => {
      const socket = makeSocket(2); // CLOSING
      registerConnection(socket);
      const pruned = pruneStale();
      expect(pruned).toBe(1);
      expect(getConnectionCount()).toBe(0);
    });

    it('should remove connections with CLOSED readyState (3)', () => {
      const socket = makeSocket(3); // CLOSED
      registerConnection(socket);
      const pruned = pruneStale();
      expect(pruned).toBe(1);
      expect(getConnectionCount()).toBe(0);
    });

    it('should keep connections with OPEN readyState (1)', () => {
      const socket = makeSocket(1); // OPEN
      registerConnection(socket);
      const pruned = pruneStale();
      expect(pruned).toBe(0);
      expect(getConnectionCount()).toBe(1);
    });

    it('should keep connections with CONNECTING readyState (0)', () => {
      const socket = makeSocket(0); // CONNECTING
      registerConnection(socket);
      const pruned = pruneStale();
      expect(pruned).toBe(0);
      expect(getConnectionCount()).toBe(1);
    });

    it('should return 0 when no stale connections exist', () => {
      registerConnection(makeSocket(1));
      registerConnection(makeSocket(1));
      expect(pruneStale()).toBe(0);
    });

    it('should only prune stale connections in a mixed set', () => {
      registerConnection(makeSocket(1)); // open — keep
      registerConnection(makeSocket(3)); // closed — prune
      registerConnection(makeSocket(1)); // open — keep
      registerConnection(makeSocket(2)); // closing — prune
      const pruned = pruneStale();
      expect(pruned).toBe(2);
      expect(getConnectionCount()).toBe(2);
    });
  });
});
