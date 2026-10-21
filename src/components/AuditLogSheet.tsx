import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { useQuery } from '@tanstack/react-query';
import {
  closeOutline,
  documentTextOutline,
  cartOutline,
  walletOutline,
  cardOutline,
  peopleOutline,
  settingsOutline,
  notificationsOutline,
  shieldCheckmarkOutline,
  timeOutline,
  refreshOutline,
} from 'ionicons/icons';
import { adminAuditApi } from '../services/api';
import { useAuditStore, type AuditEntry, type AuditStatus } from '../services/auditLog';
import { formatGhanaDateTime } from '../utils/date';
import './AuditLogSheet.css';

export type AuditFilter = 'all' | 'success' | 'queued' | 'synced' | 'reverted' | 'failed';

const FILTERS: { key: AuditFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'success', label: 'Success' },
  { key: 'queued', label: 'Queued' },
  { key: 'synced', label: 'Synced' },
  { key: 'reverted', label: 'Reverted' },
  { key: 'failed', label: 'Failed' },
];

const ENTITY_ICON: Record<string, string> = {
  registration: documentTextOutline,
  order: cartOutline,
  wallet: walletOutline,
  payment: cardOutline,
  customer: peopleOutline,
  settings: settingsOutline,
  notification: notificationsOutline,
  security: shieldCheckmarkOutline,
};

const STATUS_LABEL: Record<AuditStatus, string> = {
  success: 'Success',
  queued: 'Queued',
  synced: 'Synced',
  reverted: 'Reverted',
  failed: 'Failed',
};

const ACTION_LABEL: Record<string, string> = {
  registration_status: 'Registration status changed',
  order_status: 'Order status changed',
  bulk_registration_update: 'Bulk registration update',
  wallet_credit: 'Wallet credited',
  wallet_debit: 'Wallet debited',
  wallet_freeze: 'Wallet frozen',
  payment_refund: 'Payment refunded',
  customer_delete: 'Customer deleted',
  settings_save: 'Settings saved',
  batch_notification: 'Batch notification sent',
  batch_export: 'Batch export',
  security_verified: 'Security verification passed',
};

export interface MergedAuditRow {
  id: string;
  action: string;
  actionLabel: string;
  entity: string;
  entityId?: string | null;
  status: string;
  adminName: string;
  createdAt: string;
  source: 'device' | 'server';
}

/** Normalize a server audit_logs row (joined profiles, new_value payload). */
const normalizeServerRow = (row: Record<string, unknown>, index: number): MergedAuditRow => {
  const profiles = row.profiles as { full_name?: string; email?: string } | null;
  const newValue = (row.new_value ?? row.details ?? null) as Record<string, unknown> | null;
  const status = (newValue?.status as string) || 'success';
  const action = String(row.action || 'admin_action');
  return {
    id: String(row.id || `srv-${index}`),
    action,
    actionLabel: ACTION_LABEL[action] || action.replace(/_/g, ' '),
    entity: String(row.entity || ''),
    entityId: (row.entity_id as string) ?? null,
    status,
    adminName: newValue?.admin_name ? String(newValue.admin_name) : profiles?.full_name || profiles?.email || 'Admin',
    createdAt: String(row.created_at || ''),
    source: 'server',
  };
};

const deviceRow = (entry: AuditEntry): MergedAuditRow => ({
  id: entry.id,
  action: entry.action,
  actionLabel: ACTION_LABEL[entry.action] || entry.action.replace(/_/g, ' '),
  entity: entry.entity,
  entityId: entry.entity_id ?? null,
  status: entry.status,
  adminName: entry.admin_name,
  createdAt: entry.created_at,
  source: 'device',
});

interface AuditLogSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Bottom-sheet activity stream: device buffer + server audit_logs merged. */
export const AuditLogSheet: React.FC<AuditLogSheetProps> = ({ open, onClose }) => {
  const [filter, setFilter] = useState<AuditFilter>('all');
  const localEntries = useAuditStore((s) => s.entries);

  const { data: serverRows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin_audit_logs'],
    queryFn: () => adminAuditApi.list(),
    enabled: open,
    staleTime: 15_000,
  });

  const rows = useMemo<MergedAuditRow[]>(() => {
    const server = (serverRows as unknown as Record<string, unknown>[]).map(normalizeServerRow);
    const device = localEntries.map(deviceRow);
    // Device entries synced to the server appear twice — drop server rows
    // whose (action, entity_id, minute) match a local entry.
    const deviceKeys = new Set(
      device.map((d) => `${d.action}|${d.entityId}|${d.createdAt.slice(0, 16)}`)
    );
    const dedupedServer = server.filter(
      (s) => !deviceKeys.has(`${s.action}|${s.entityId}|${s.createdAt.slice(0, 16)}`)
    );
    return [...device, ...dedupedServer].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [localEntries, serverRows]);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  if (!open) return null;

  return createPortal(
    <>
      <div className="al-scrim" onClick={onClose} aria-hidden="true" />
      <div className="al-sheet" role="dialog" aria-modal="true" aria-label="Admin activity">
        <div className="m3-sheet-handle" aria-hidden="true" />

        <div className="al-header">
          <div>
            <p className="al-title">Admin activity</p>
            <p className="al-subtitle">{rows.length} event{rows.length === 1 ? '' : 's'}</p>
          </div>
          <div className="al-header-actions">
            <button type="button" className="al-icon-btn" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh activity">
              <IonIcon icon={refreshOutline} />
            </button>
            <button type="button" className="al-icon-btn" onClick={onClose} aria-label="Close activity">
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        </div>

        <div className="al-filters" role="tablist" aria-label="Filter activity by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`al-filter ${filter === f.key ? 'al-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="al-list">
          {isLoading ? (
            [0, 1, 2].map((i) => <div key={i} className="al-card al-card--skeleton" />)
          ) : filtered.length === 0 ? (
            <div className="al-empty">
              <IonIcon icon={timeOutline} />
              <p>No activity recorded yet</p>
            </div>
          ) : (
            filtered.slice(0, 60).map((row) => (
              <div key={row.id} className="al-card">
                <span className="al-card-icon">
                  <IonIcon icon={ENTITY_ICON[row.entity] || shieldCheckmarkOutline} />
                </span>
                <div className="al-card-body">
                  <p className="al-card-action">{row.actionLabel}</p>
                  <p className="al-card-meta">
                    {row.adminName}
                    {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
                    {row.source === 'device' ? ' · device' : ''}
                  </p>
                  <p className="al-card-time">{formatGhanaDateTime(row.createdAt)}</p>
                </div>
                <span className={`al-status al-status--${row.status}`}>{STATUS_LABEL[row.status as AuditStatus] || row.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

export default AuditLogSheet;
