import { create } from 'zustand';
import { auditApi } from './api';
import { useAuthStore } from '../store/authStore';

/**
 * Admin activity stream.
 *
 * Every entry is written to a localStorage ring buffer immediately (works
 * offline, survives reloads) and mirrored to the `audit_logs` table through
 * the admin-audit edge function when connectivity allows. The UI merges the
 * device buffer with the server list.
 */

export type AuditStatus = 'success' | 'queued' | 'synced' | 'reverted' | 'failed';

export interface AuditEntry {
  id: string;
  /** Machine action, e.g. 'registration_status', 'wallet_credit'. */
  action: string;
  /** Entity kind, e.g. 'registration', 'order', 'settings'. */
  entity: string;
  entity_id?: string;
  status: AuditStatus;
  admin_id: string | null;
  admin_name: string;
  details?: Record<string, unknown>;
  created_at: string;
  source: 'device';
}

const STORAGE_KEY = 'afa-audit-log-v1';
const MAX_ENTRIES = 200;

const makeId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const load = (): AuditEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AuditEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

interface AuditStoreState {
  entries: AuditEntry[];
  record: (input: {
    action: string;
    entity: string;
    entity_id?: string;
    status: AuditStatus;
    details?: Record<string, unknown>;
  }) => AuditEntry;
  clearLocal: () => void;
}

export const useAuditStore = create<AuditStoreState>((set, get) => {
  const persist = (entries: AuditEntry[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full/blocked — in-memory only this session */
    }
    set({ entries });
  };

  return {
    entries: load(),

    record: ({ action, entity, entity_id, status, details }) => {
      const user = useAuthStore.getState().user;
      const entry: AuditEntry = {
        id: makeId(),
        action,
        entity,
        entity_id,
        status,
        admin_id: user?.id ?? null,
        admin_name: user?.full_name || user?.email || 'Admin',
        details,
        created_at: new Date().toISOString(),
        source: 'device',
      };
      const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
      persist(next);

      // Mirror to the server when possible — fire-and-forget so an audit
      // write can never block or fail the action it is describing.
      if (navigator.onLine) {
        void auditApi
          .create({ entity, entity_id, action, details: { status, admin_name: entry.admin_name, ...details } })
          .catch(() => {
            /* device buffer remains the fallback */
          });
      }
      return entry;
    },

    clearLocal: () => persist([]),
  };
});

/** Convenience recorder used by pages/components. */
export const recordAudit = (
  input: Parameters<AuditStoreState['record']>[0]
): void => {
  useAuditStore.getState().record(input);
};
