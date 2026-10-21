import React, { useMemo, useState } from 'react';
import { IonPage, IonIcon, IonButton } from '@ionic/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  timeOutline,
  documentTextOutline,
  cartOutline,
  walletOutline,
  cardOutline,
  peopleOutline,
  settingsOutline,
  notificationsOutline,
  shieldCheckmarkOutline,
  refreshOutline,
} from 'ionicons/icons';
import AdminLayout from '../../layouts/AdminLayout';
import Card from '../../components/Card';
import { M3SkeletonList } from '../../components/M3Skeleton';
import { M3ChipRow } from '../../components/M3ChipRow';
import { adminAuditApi } from '../../services/api';
import { useAuditStore, type AuditEntry } from '../../services/auditLog';
import { formatGhanaDateTime } from '../../utils/date';
import './AuditLogPage.css';

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

interface ActivityRow {
  id: string;
  actionLabel: string;
  entity: string;
  entityId?: string | null;
  status: string;
  adminName: string;
  createdAt: string;
  source: 'device' | 'server';
}

const normalizeServerRow = (row: Record<string, unknown>, index: number): ActivityRow => {
  const profiles = row.profiles as { full_name?: string; email?: string } | null;
  const newValue = (row.new_value ?? row.details ?? null) as Record<string, unknown> | null;
  const action = String(row.action || 'admin_action');
  return {
    id: String(row.id || `srv-${index}`),
    actionLabel: ACTION_LABEL[action] || action.replace(/_/g, ' '),
    entity: String(row.entity || ''),
    entityId: (row.entity_id as string) ?? null,
    status: (newValue?.status as string) || 'success',
    adminName: newValue?.admin_name ? String(newValue.admin_name) : profiles?.full_name || profiles?.email || 'Admin',
    createdAt: String(row.created_at || ''),
    source: 'server',
  };
};

const deviceRow = (entry: AuditEntry): ActivityRow => ({
  id: entry.id,
  actionLabel: ACTION_LABEL[entry.action] || entry.action.replace(/_/g, ' '),
  entity: entry.entity,
  entityId: entry.entity_id ?? null,
  status: entry.status,
  adminName: entry.admin_name,
  createdAt: entry.created_at,
  source: 'device',
});

const AuditLogPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const localEntries = useAuditStore((s) => s.entries);

  const { data: serverRows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_audit_logs'],
    queryFn: () => adminAuditApi.list(),
    staleTime: 15_000,
  });

  const rows = useMemo<ActivityRow[]>(() => {
    const server = (serverRows as unknown as Record<string, unknown>[]).map(normalizeServerRow);
    const device = localEntries.map(deviceRow);
    const deviceKeys = new Set(
      device.map((d) => `${d.actionLabel}|${d.entityId}|${d.createdAt.slice(0, 16)}`)
    );
    const dedupedServer = server.filter(
      (s) => !deviceKeys.has(`${s.actionLabel}|${s.entityId}|${s.createdAt.slice(0, 16)}`)
    );
    return [...device, ...dedupedServer].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [localEntries, serverRows]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter]
  );

  const chips = [
    { value: 'all', label: 'All', count: rows.length },
    { value: 'success', label: 'Success', count: rows.filter((r) => r.status === 'success').length },
    { value: 'queued', label: 'Queued', count: rows.filter((r) => r.status === 'queued').length },
    { value: 'synced', label: 'Synced', count: rows.filter((r) => r.status === 'synced').length },
    { value: 'reverted', label: 'Reverted', count: rows.filter((r) => r.status === 'reverted').length },
    { value: 'failed', label: 'Failed', count: rows.filter((r) => r.status === 'failed').length },
  ];

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-audit-page">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
            <div className="page-title-row">
              <IonIcon icon={timeOutline} className="page-icon" />
              <h1>Activity Log</h1>
              <span className="page-count">{rows.length} events</span>
              <button type="button" className="audit-refresh-btn" onClick={() => void refetch()}>
                <IonIcon icon={refreshOutline} />
                <span>Refresh</span>
              </button>
            </div>
            <p className="audit-subtitle">Every admin action on this device and server — including offline-queued changes.</p>
          </motion.div>

          <M3ChipRow options={chips} value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" />

          <div className="audit-list">
            {isLoading ? (
              <M3SkeletonList count={6} lines={2} />
            ) : isError && rows.length === 0 ? (
              <div className="empty-state">
                <IonIcon icon={timeOutline} />
                <p>Failed to load activity. Pull to retry.</p>
                <IonButton fill="clear" onClick={() => void refetch()}>Retry</IonButton>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <IonIcon icon={timeOutline} />
                <p>No activity recorded yet</p>
              </div>
            ) : (
              <AnimatePresence>
                {filtered.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                  >
                    <Card className="audit-card">
                      <span className="audit-card-icon">
                        <IonIcon icon={ENTITY_ICON[row.entity] || shieldCheckmarkOutline} />
                      </span>
                      <div className="audit-card-body">
                        <p className="audit-card-action">{row.actionLabel}</p>
                        <p className="audit-card-meta">
                          {row.adminName}
                          {row.entity ? ` · ${row.entity}` : ''}
                          {row.entityId ? ` · ${String(row.entityId).slice(0, 8)}` : ''}
                          {row.source === 'device' ? ' · device' : ' · server'}
                        </p>
                        <p className="audit-card-time">{formatGhanaDateTime(row.createdAt)}</p>
                      </div>
                      <span className={`audit-status audit-status--${row.status}`}>{row.status}</span>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </AdminLayout>
    </IonPage>
  );
};

export default AuditLogPage;
