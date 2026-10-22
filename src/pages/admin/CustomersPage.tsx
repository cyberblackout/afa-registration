import React, { useState } from 'react';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonToast,
  IonActionSheet,
  IonSpinner,
  IonToggle,
  IonNote,
} from '@ionic/react';
import {
  searchOutline,
  createOutline,
  trashOutline,
  chevronDownOutline,
  chevronUpOutline,
  walletOutline,
  cartOutline,
  closeOutline,
  peopleOutline,
  swapHorizontalOutline,
  personOutline,
  briefcaseOutline,
  shieldCheckmarkOutline,
  warningOutline,
  eyeOffOutline,
  eyeOutline,
  checkmarkOutline,
  downloadOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCustomerApi, walletApi, orderApi, notificationApi } from '../../services/api';
import type { AdminCustomer } from '../../types';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import Card from '../../components/Card';
import { M3SkeletonList } from '../../components/M3Skeleton';
import { M3ChipRow } from '../../components/M3ChipRow';
import { BatchActionSheet, BatchBar, type BatchAction } from '../../components/BatchActionSheet';
import { SecurityGate } from '../../components/SecurityGate';
import { useAuthStore } from '../../store/authStore';
import { recordAudit } from '../../services/auditLog';
import { safeNumber } from '../../utils/number';
import { downloadCsv } from '../../utils/csv';
import './CustomersPage.css';

const CustomersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: authUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<AdminCustomer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [roleActionTarget, setRoleActionTarget] = useState<AdminCustomer | null>(null);
  const [showRoleSheet, setShowRoleSheet] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminCustomer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeletedUsers, setShowDeletedUsers] = useState(false);

  // ===== Multi-select + batch actions =====
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [gate, setGate] = useState<{ reason: string; run: () => void } | null>(null);

  const { data: customers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_customers'],
    queryFn: () => adminCustomerApi.list(),
  });

  const {
    data: transactions,
    isLoading: txLoading,
    isError: txError,
    refetch: refetchTx,
  } = useQuery({
    queryKey: ['admin_customer_transactions', expandedId],
    queryFn: () => walletApi.adminListTransactions(expandedId!),
    enabled: !!expandedId,
  });

  const {
    data: customerOrders,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['admin_customer_orders', expandedId],
    queryFn: () => orderApi.list(expandedId!),
    enabled: !!expandedId,
  });

  const filtered = customers
    .filter((c) => showDeletedUsers ? true : !c.deleted_at)
    .filter((c) => roleFilter === 'all' || (c.role || 'user') === roleFilter)
    .filter((c) =>
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    );

  const activeCount = customers.filter((c) => !c.deleted_at).length;
  const deletedCount = customers.filter((c) => c.deleted_at).length;

  const roleChips = [
    { value: 'all', label: 'All', count: customers.filter((c) => showDeletedUsers || !c.deleted_at).length },
    { value: 'user', label: 'Users', count: customers.filter((c) => (c.role || 'user') === 'user' && (showDeletedUsers || !c.deleted_at)).length },
    { value: 'agent', label: 'Agents', count: customers.filter((c) => c.role === 'agent' && (showDeletedUsers || !c.deleted_at)).length },
    { value: 'admin', label: 'Admins', count: customers.filter((c) => c.role === 'admin' && (showDeletedUsers || !c.deleted_at)).length },
  ];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    clearSelection();
  };

  const selectedCustomers = () => filtered.filter((c) => selected.has(c.id));

  const exportSelected = () => {
    const rows = selectedCustomers();
    downloadCsv(
      'customers.csv',
      ['Full Name', 'Email', 'Phone', 'Role', 'Wallet Balance', 'Created'],
      rows.map((c) => [c.full_name || '', c.email || '', c.phone || '', c.role || 'user', safeNumber(c.wallet_balance).toFixed(2), formatGhanaDate(c.created_at)])
    );
    recordAudit({ action: 'batch_export', entity: 'customer', status: 'success', details: { count: rows.length, format: 'csv' } });
    setToastMessage(`Exported ${rows.length} customer${rows.length === 1 ? '' : 's'}`);
    setShowToast(true);
  };

  const sendBatchNotification = async (message: string) => {
    const rows = selectedCustomers();
    const ids = rows.map((c) => c.id);
    try {
      await notificationApi.adminSend('Update from MTN AFA', message, 'info', ids);
      recordAudit({ action: 'batch_notification', entity: 'customer', status: 'success', details: { recipients: ids.length } });
      setToastMessage(`Notification sent to ${ids.length} user${ids.length === 1 ? '' : 's'}`);
      setShowToast(true);
    } catch (err) {
      recordAudit({
        action: 'batch_notification',
        entity: 'customer',
        status: 'failed',
        details: { recipients: ids.length, error: err instanceof Error ? err.message : 'unknown' },
      });
      setToastMessage(err instanceof Error ? err.message : 'Failed to send notification');
      setShowToast(true);
      throw err;
    }
  };

  const batchActions: BatchAction[] = [
    {
      key: 'export',
      label: `Export ${selected.size} selected as CSV`,
      icon: downloadOutline,
      onRun: exportSelected,
    },
    {
      key: 'notify',
      label: 'Send notification',
      icon: chatbubblesOutline,
      compose: { placeholder: 'Type the message to send to selected users…' },
    },
  ];

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openEdit = (c: AdminCustomer) => {
    setEditCustomer(c);
    setEditName(c.full_name || '');
    setEditEmail(c.email || '');
    setEditPhone(c.phone || '');
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editCustomer) return;
    try {
      await adminCustomerApi.updateProfile(editCustomer.id, { full_name: editName, email: editEmail, phone: editPhone });
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      setShowEditModal(false);
      setEditCustomer(null);
      setToastMessage('Customer details updated successfully');
      setShowToast(true);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to update customer');
      setShowToast(true);
    }
  };

  const setRole = async (targetUser: AdminCustomer) => {
    setRoleActionTarget(targetUser);
    setShowRoleSheet(true);
  };

  const applyRoleChange = async (target: AdminCustomer, newRole: string) => {
    setIsChangingRole(true);
    try {
      // Optimistic cache update so the UI reflects the change immediately.
      queryClient.setQueryData<AdminCustomer[]>(['admin_customers'], (old) =>
        old ? old.map((c) => (c.id === target.id ? { ...c, role: newRole as AdminCustomer['role'] } : c)) : old
      );
      await adminCustomerApi.setRole(target.id, newRole);
      await queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      // A role change re-resolves the AFA price for that user.
      queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
      recordAudit({
        action: 'role_change',
        entity: 'customer',
        entity_id: target.id,
        status: 'success',
        details: { from: target.role, to: newRole },
      });
      setToastMessage(`${target.full_name || target.email} is now ${newRole}`);
      setShowToast(true);
    } catch (err) {
      // Roll back the optimistic update by re-syncing with the server.
      await queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      recordAudit({
        action: 'role_change',
        entity: 'customer',
        entity_id: target.id,
        status: 'failed',
        details: { from: target.role, to: newRole, error: err instanceof Error ? err.message : 'unknown' },
      });
      setToastMessage(err instanceof Error ? err.message : 'Failed to update role');
      setShowToast(true);
    } finally {
      setIsChangingRole(false);
    }
  };

  const confirmRoleChange = (newRole: string) => {
    const target = roleActionTarget;
    if (!target) return;
    const currentRole = (target.role || 'user') as string;
    if (currentRole === newRole) {
      setToastMessage(`${target.full_name || target.email} is already ${newRole}`);
      setShowToast(true);
      setRoleActionTarget(null);
      return;
    }
    // Self-demotion safety check: an active admin cannot revoke their own admin access.
    if (authUser && target.id === authUser.id) {
      setToastMessage('You cannot change your own role. Ask another admin to do it.');
      setShowToast(true);
      setRoleActionTarget(null);
      return;
    }
    setShowRoleSheet(false);
    // Bi-directional switching (USER <-> AGENT <-> ADMIN), including ADMIN -> USER
    // downgrades, is confirmed through the SecurityGate re-auth step.
    setGate({
      reason: `Change ${target.full_name || target.email} from ${currentRole.toUpperCase()} to ${newRole.toUpperCase()}`,
      run: () => applyRoleChange(target, newRole),
    });
  };

  const openDeleteConfirm = (c: AdminCustomer) => {
    setDeleteTarget(c);
    setDeleteConfirmEmail('');
    setDeleteReason('');
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmEmail !== deleteTarget.email) {
      setToastMessage('Email does not match. Type the exact email to confirm.');
      setShowToast(true);
      return;
    }
    const target = deleteTarget;
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      const result = await adminCustomerApi.deleteUser(target.id, deleteReason || undefined);
      // Hard delete: purge the user from the local cache immediately so the
      // row disappears without a page refresh, then re-sync with the server.
      queryClient.setQueryData<AdminCustomer[]>(['admin_customers'], (old) =>
        old ? old.filter((c) => c.id !== target.id) : old
      );
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      recordAudit({
        action: 'customer_delete',
        entity: 'customer',
        entity_id: target.id,
        status: 'success',
        details: { email: target.email, reason: deleteReason || undefined, hard_deleted: true, auth_delete: result?.data?.auth_delete_status },
      });
      setToastMessage(`${target.full_name || 'User'} has been permanently deleted`);
      setShowToast(true);
    } catch (err) {
      recordAudit({
        action: 'customer_delete',
        entity: 'customer',
        entity_id: target.id,
        status: 'failed',
        details: { email: target.email, error: err instanceof Error ? err.message : 'unknown' },
      });
      setToastMessage(err instanceof Error ? err.message : 'Failed to delete user');
      setShowToast(true);
      // Re-sync in case the server partially completed the deletion.
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
      setDeleteConfirmEmail('');
      setDeleteReason('');
    }
  };

  const getRoleLabel = (c: AdminCustomer): string => {
    if (c.role === 'admin') return 'Admin';
    if (c.role === 'agent') return 'Agent';
    return 'User';
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_customer_transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_customer_orders'] });
  };

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-customers-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <div className="page-title-left">
              <IonIcon icon={peopleOutline} className="page-icon" />
              <h1>Customers</h1>
              <span className="customer-count">{activeCount} active{deletedCount > 0 ? ` / ${deletedCount} deleted` : ''}</span>
            </div>
            <button type="button" className={`select-mode-btn ${selectMode ? 'select-mode-btn--on' : ''}`} onClick={toggleSelectMode}>
              {selectMode ? 'Done' : 'Select'}
            </button>
          </div>
          <div className="search-bar">
            <IonIcon icon={searchOutline} className="search-icon" />
            <input type="text" placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>
          {deletedCount > 0 && (
            <div className="deleted-toggle">
              <IonIcon icon={showDeletedUsers ? eyeOffOutline : eyeOutline} className="toggle-icon" />
              <IonToggle
                checked={showDeletedUsers}
                onIonChange={(e) => setShowDeletedUsers(e.detail.checked)}
                labelPlacement="end"
              >
                <span className="toggle-label">Show deleted users</span>
              </IonToggle>
            </div>
          )}
        </motion.div>

        <M3ChipRow options={roleChips} value={roleFilter} onChange={setRoleFilter} ariaLabel="Filter by role" />

        <div className="customers-list">
          {isLoading ? (
            <M3SkeletonList count={5} lines={2} />
          ) : isError ? (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>Failed to load customers. Please try again.</p>
              <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <IonIcon icon={peopleOutline} />
                  <p>No customers found</p>
                </div>
              ) : filtered.map((customer, index) => {
                const roleLabel = getRoleLabel(customer);
                return (
                  <motion.div
                    key={customer.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.03 }}
                    className="customer-card-wrapper"
                  >
                    <Card hover noPadding className="customer-card" onClick={() => (selectMode ? toggleSelect(customer.id) : toggleExpand(customer.id))}>
                      <div className="customer-main">
                        {selectMode && (
                          <button
                            type="button"
                            className={`cust-check ${selected.has(customer.id) ? 'cust-check--on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(customer.id); }}
                            aria-label={`Select ${customer.full_name || 'customer'}`}
                            aria-pressed={selected.has(customer.id)}
                          >
                            {selected.has(customer.id) && <IonIcon icon={checkmarkOutline} />}
                          </button>
                        )}
                        <div className={`status-dot ${customer.role === 'admin' ? 'dot-active' : customer.role === 'agent' ? 'dot-agent' : 'dot-suspended'}`} />
                        <div className="customer-info">
                          <span className="customer-name">{customer.full_name || 'Unknown'}</span>
                          <span className="customer-email">{customer.email}</span>
                        </div>
                        <div className="customer-meta">
                          <span className="customer-phone">{customer.phone}</span>
                          <span className={`customer-status ${customer.role === 'admin' ? 'status-active' : customer.role === 'agent' ? 'status-agent' : 'status-suspended'}`}>{roleLabel}</span>
                          <span className="customer-date">{formatGhanaDate(customer.created_at)}</span>
                        </div>
                        <div className="customer-actions">
                          {!customer.deleted_at && (
                            <>
                              <button className="action-btn edit-btn" onClick={(e) => { e.stopPropagation(); openEdit(customer); }} title="Edit">
                                <IonIcon icon={createOutline} />
                              </button>
                              <button
                                className="action-btn toggle-role-btn"
                                onClick={(e) => { e.stopPropagation(); setRole(customer); }}
                                title="Change Role"
                                disabled={isChangingRole}
                              >
                                {isChangingRole ? <IonSpinner name="crescent" /> : <IonIcon icon={swapHorizontalOutline} />}
                              </button>
                              {customer.role !== 'admin' && (
                                <button
                                  className="action-btn delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGate({
                                      reason: `Delete ${customer.full_name || customer.email}`,
                                      run: () => openDeleteConfirm(customer),
                                    });
                                  }}
                                  title="Delete User"
                                  disabled={isDeleting}
                                >
                                  <IonIcon icon={trashOutline} />
                                </button>
                              )}
                            </>
                          )}
                          {customer.deleted_at && (
                            <IonNote className="deleted-badge">Deleted</IonNote>
                          )}
                        </div>
                        <div className="expand-icon">
                          <IonIcon icon={expandedId === customer.id ? chevronUpOutline : chevronDownOutline} />
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedId === customer.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="customer-details"
                          >
                            <div className="details-grid">
                              <div className="detail-item">
                                <IonIcon icon={walletOutline} className="detail-icon" />
                                <div>
                                  <span className="detail-label">Wallet Balance</span>
                                  <span className="detail-value">GH₵ {safeNumber(customer.wallet_balance).toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="detail-item">
                                <IonIcon icon={cartOutline} className="detail-icon" />
                                <div>
                                  <span className="detail-label">Role</span>
                                  <span className="detail-value">{customer.role || 'user'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="detail-section">
                              <h4>Recent Transactions</h4>
                              {txLoading ? (
                                <p className="no-data">Loading…</p>
                              ) : txError ? (
                                <p className="no-data" style={{ cursor: 'pointer' }} onClick={() => refetchTx()}>
                                  Could not load transactions — tap to retry
                                </p>
                              ) : !transactions || transactions.length === 0 ? (
                                <p className="no-data">No transactions recorded</p>
                              ) : (
                                <div className="detail-table">
                                  {transactions.map((t, i) => (
                                    <div key={t.id || i} className="detail-row">
                                      <span>{formatGhanaDate(t.created_at)}</span>
                                      <span className={t.type === 'credit' ? 'tx-credit' : 'tx-debit'}>
                                        {t.type === 'credit' ? '+' : '-'}GH₵ {safeNumber(t.amount).toFixed(2)}
                                      </span>
                                      <span>{t.description}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="detail-section">
                              <h4>Recent Orders</h4>
                              {ordersLoading ? (
                                <p className="no-data">Loading…</p>
                              ) : ordersError ? (
                                <p className="no-data" style={{ cursor: 'pointer' }} onClick={() => refetchOrders()}>
                                  Could not load orders — tap to retry
                                </p>
                              ) : !customerOrders || customerOrders.length === 0 ? (
                                <p className="no-data">No orders yet</p>
                              ) : (
                                <div className="detail-table">
                                  {customerOrders.map((o, i) => (
                                    <div key={o.id || i} className="detail-row">
                                      <span>{o.id?.slice(0, 8)}</span>
                                      <span>GH₵ {safeNumber(o.amount).toFixed(2)}</span>
                                      <span className={`order-status-dot ${o.status}`}>{o.status}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {selectMode && selected.size > 0 && (
        <BatchBar count={selected.size} onActions={() => setBatchOpen(true)} onClear={clearSelection} />
      )}
      <BatchActionSheet
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        count={selected.size}
        title="Customers"
        actions={batchActions}
        onComposeSend={sendBatchNotification}
        onClearSelection={clearSelection}
      />
    </AdminLayout>

      {/* Overlays must live at IonPage level, outside IonContent's scroll container. */}
      <IonModal isOpen={showEditModal} onDidDismiss={() => setShowEditModal(false)} className="edit-modal">
        <div className="modal-header">
          <h2>Edit Customer</h2>
          <button className="modal-close-btn" onClick={() => setShowEditModal(false)}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>
        <div className="modal-body">
          <IonItem>
            <IonLabel position="stacked">Full Name</IonLabel>
            <IonInput value={editName} onIonChange={(e) => setEditName(e.detail.value || '')} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Email</IonLabel>
            <IonInput type="email" value={editEmail} onIonChange={(e) => setEditEmail(e.detail.value || '')} />
          </IonItem>
          <IonItem>
            <IonLabel position="stacked">Phone</IonLabel>
            <IonInput value={editPhone} onIonChange={(e) => setEditPhone(e.detail.value || '')} />
          </IonItem>
          <IonButton expand="block" className="save-btn" onClick={saveEdit}>
            Save Changes
          </IonButton>
        </div>
      </IonModal>

      <IonModal isOpen={showDeleteConfirm} onDidDismiss={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }} className="delete-confirm-modal">
        <div className="modal-header danger-header">
          <IonIcon icon={warningOutline} className="danger-icon" />
          <h2>Delete User</h2>
          <button className="modal-close-btn" onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}>
            <IonIcon icon={closeOutline} />
          </button>
        </div>
        <div className="modal-body">
          <div className="danger-warning">
            <p><strong>This action is irreversible.</strong> The following will happen to <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>:</p>
            <ul>
              <li>Authentication account permanently deleted — the user can never log in again</li>
              <li>Profile and all personal data permanently removed</li>
              <li>Orders, wallet history and all linked records purged</li>
            </ul>
            <p className="retain-note">A pre-deletion audit snapshot is retained for compliance.</p>
          </div>
          <IonItem>
            <IonLabel position="stacked">Type <strong>{deleteTarget?.email}</strong> to confirm</IonLabel>
            <IonInput
              value={deleteConfirmEmail}
              onIonChange={(e) => setDeleteConfirmEmail(e.detail.value || '')}
              placeholder={deleteTarget?.email}
              className="confirm-email-input"
            />
          </IonItem>
          <IonButton
            expand="block"
            className="delete-confirm-btn"
            onClick={confirmDelete}
            disabled={deleteConfirmEmail !== deleteTarget?.email || isDeleting}
          >
            {isDeleting ? <IonSpinner name="crescent" /> : 'Permanently Delete User'}
          </IonButton>
        </div>
      </IonModal>

      <IonActionSheet
        isOpen={showRoleSheet}
        onDidDismiss={() => { setShowRoleSheet(false); setRoleActionTarget(null); }}
        header={`Change role for ${roleActionTarget?.full_name || ''}`}
        buttons={[
          {
            text: 'Set as User',
            icon: personOutline,
            handler: () => confirmRoleChange('user'),
          },
          {
            text: 'Set as Agent',
            icon: briefcaseOutline,
            handler: () => confirmRoleChange('agent'),
          },
          {
            text: 'Set as Admin',
            icon: shieldCheckmarkOutline,
            role: 'destructive' as const,
            handler: () => confirmRoleChange('admin'),
          },
          {
            text: 'Cancel',
            role: 'cancel' as const,
          },
        ]}
      />

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color="success"
      />

      <SecurityGate
        open={!!gate}
        reason={gate?.reason || ''}
        onSuccess={() => {
          gate?.run();
          setGate(null);
        }}
        onCancel={() => setGate(null)}
      />
    </IonPage>
  );
};

export default CustomersPage;
