import { registrationApi, orderApi } from './api';
import { recordAudit } from './auditLog';

/**
 * Offline action queue.
 *
 * Status-changing actions performed while `navigator.onLine` is false are
 * persisted to localStorage and replayed in order when connectivity returns.
 * Executors are resolved here (not at enqueue time) so the queue stays fully
 * serializable across page loads.
 */

export type OfflineActionKind = 'registration_status' | 'order_status';

export interface OfflineQueuedAction {
  id: string;
  kind: OfflineActionKind;
  /** Human-readable label for the offline banner / toasts. */
  label: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const STORAGE_KEY = 'afa-offline-queue-v1';
const MAX_QUEUE = 100;

const load = (): OfflineQueuedAction[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as OfflineQueuedAction[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

let queue: OfflineQueuedAction[] = load();
const listeners = new Set<() => void>();
let flushing = false;

const notify = () => {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* listener errors must never break the queue */
    }
  });
};

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full/blocked — queue still works in-memory this session */
  }
  notify();
};

const makeId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const execute = async (action: OfflineQueuedAction): Promise<void> => {
  switch (action.kind) {
    case 'registration_status': {
      const { id, status } = action.payload as { id: string; status: string };
      await registrationApi.adminUpdateStatus(id, status);
      return;
    }
    case 'order_status': {
      const { id, status } = action.payload as { id: string; status: string };
      await orderApi.updateStatus(id, status);
      return;
    }
    default: {
      // Unknown kind from an older app version — drop it rather than wedge the queue.
      throw new Error(`Unknown queued action kind: ${action.kind}`);
    }
  }
};

export const offlineQueue = {
  getQueue: (): OfflineQueuedAction[] => queue.slice(),

  getCount: (): number => queue.length,

  subscribe: (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },

  enqueue: (kind: OfflineActionKind, label: string, payload: Record<string, unknown>): OfflineQueuedAction => {
    const action: OfflineQueuedAction = {
      id: makeId(),
      kind,
      label,
      payload,
      createdAt: new Date().toISOString(),
    };
    queue.push(action);
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persist();
    return action;
  },

  clear: () => {
    queue = [];
    persist();
  },

  /** Replay queued actions in FIFO order. Failures stay queued. */
  flush: async (): Promise<{ synced: number; failed: number }> => {
    if (flushing || queue.length === 0 || !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }
    flushing = true;
    let synced = 0;
    let failed = 0;
    try {
      const remaining: OfflineQueuedAction[] = [];
      for (const action of queue) {
        try {
          await execute(action);
          synced += 1;
          recordAudit({
            action: action.kind,
            entity: action.kind === 'registration_status' ? 'registration' : 'order',
            entity_id: (action.payload as { id?: string }).id,
            status: 'synced',
            details: { label: action.label, queued_at: action.createdAt },
          });
        } catch {
          failed += 1;
          remaining.push(action);
        }
      }
      queue = remaining;
      persist();
    } finally {
      flushing = false;
    }
    return { synced, failed };
  },
};
