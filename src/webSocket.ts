/**
 * WebSocket connection manager with proper cleanup on disconnect.
 * Fixes memory leak where event listeners accumulated after disconnection.
 */

export interface WebSocketLike {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  removeAllListeners?(event?: string): void;
  readyState: number;
}

export interface ConnectionRecord {
  id: string;
  socket: WebSocketLike;
  connectedAt: number;
  listeners: Map<string, (...args: any[]) => void>;
}

const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/** Active connections keyed by connection ID. */
const connections = new Map<string, ConnectionRecord>();

let nextId = 1;

/**
 * Register a WebSocket connection and attach lifecycle listeners.
 * Returns the connection ID for later reference.
 */
export function registerConnection(socket: WebSocketLike): string {
  const id = String(nextId++);

  const listeners = new Map<string, (...args: any[]) => void>();

  const onClose = () => removeConnection(id);
  const onError = () => removeConnection(id);

  listeners.set('close', onClose);
  listeners.set('error', onError);

  socket.on('close', onClose);
  socket.on('error', onError);

  connections.set(id, { id, socket, connectedAt: Date.now(), listeners });

  return id;
}

/**
 * Remove a connection and clean up all attached event listeners.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function removeConnection(id: string): void {
  const record = connections.get(id);
  if (!record) return;

  connections.delete(id);

  for (const [event, listener] of record.listeners) {
    record.socket.off(event, listener);
  }
  record.listeners.clear();
}

/**
 * Attach a named listener to an active connection.
 * The listener is tracked and will be removed on disconnect.
 */
export function addListener(
  id: string,
  event: string,
  listener: (...args: any[]) => void
): boolean {
  const record = connections.get(id);
  if (!record) return false;

  // Remove any existing listener for the same event before adding new one
  const existing = record.listeners.get(event);
  if (existing) {
    record.socket.off(event, existing);
  }

  record.listeners.set(event, listener);
  record.socket.on(event, listener);
  return true;
}

/** Return the number of currently active connections. */
export function getConnectionCount(): number {
  return connections.size;
}

/** Return connection metadata for a given ID. */
export function getConnectionRecord(id: string): ConnectionRecord | undefined {
  return connections.get(id);
}

/**
 * Close and clean up all active connections.
 * Useful for graceful server shutdown or test teardown.
 */
export function closeAll(): void {
  for (const id of [...connections.keys()]) {
    removeConnection(id);
  }
}

/**
 * Prune connections whose socket is no longer open.
 * Call periodically to catch sockets that closed without firing events.
 */
export function pruneStale(): number {
  let pruned = 0;
  for (const [id, record] of connections) {
    if (
      record.socket.readyState === WS_READY_STATE.CLOSING ||
      record.socket.readyState === WS_READY_STATE.CLOSED
    ) {
      removeConnection(id);
      pruned++;
    }
  }
  return pruned;
}
