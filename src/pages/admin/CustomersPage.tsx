import React, { useState } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonCard,
  IonCardContent,
  IonToast,
  IonAlert,
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
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { adminCustomerApi, walletApi, orderApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import Card from '../../components/Card';
import './CustomersPage.css';

const CustomersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ header: string; message: string; action: () => void }>({ header: '', message: '', action: () => {} });
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [roleActionTarget, setRoleActionTarget] = useState<any>(null);
  const [showRoleSheet, setShowRoleSheet] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeletedUsers, setShowDeletedUsers] = useState(false);

  const { data: customers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_customers'],
    queryFn: () => adminCustomerApi.list() as any,
  });

  const { data: transactions } = useQuery({
    queryKey: ['admin_customer_transactions', expandedId],
    queryFn: () => walletApi.adminListTransactions(expandedId!) as any,
    enabled: !!expandedId,
  });

  const { data: customerOrders } = useQuery({
    queryKey: ['admin_customer_orders', expandedId],
    queryFn: () => orderApi.list(expandedId!) as any,
    enabled: !!expandedId,
  });

  const filtered = customers
    .filter((c: any) => showDeletedUsers ? true : !c.deleted_at)
    .filter((c: any) =>
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
    );

  const activeCount = customers.filter((c: any) => !c.deleted_at).length;
  const deletedCount = customers.filter((c: any) => c.deleted_at).length;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openEdit = (c: any) => {
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
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to update customer');
      setShowToast(true);
    }
  };

  const setRole = async (targetUser: any) => {
    setRoleActionTarget(targetUser);
    setShowRoleSheet(true);
  };

  const confirmRoleChange = async (newRole: string) => {
    if (!roleActionTarget) return;
    if (roleActionTarget.role === newRole) {
      setToastMessage(`${roleActionTarget.full_name} is already ${newRole}`);
      setShowToast(true);
      setRoleActionTarget(null);
      return;
    }
    setIsChangingRole(true);
    setShowRoleSheet(false);
    try {
      await adminCustomerApi.setRole(roleActionTarget.id, newRole);
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      setToastMessage(`${roleActionTarget.full_name} is now ${newRole}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to update role');
      setShowToast(true);
    } finally {
      setIsChangingRole(false);
      setRoleActionTarget(null);
    }
  };

  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  };

  const openDeleteConfirm = (c: any) => {
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
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      const result = await adminCustomerApi.deleteUser(deleteTarget.id, deleteReason || undefined);
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      const authWarning = result?.data?.auth_ban_status === 'failed'
        ? ' (Auth ban failed — user may still log in)'
        : '';
      setToastMessage(`${deleteTarget.full_name || 'User'} has been deleted${authWarning}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to delete user');
      setShowToast(true);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
      setDeleteConfirmEmail('');
      setDeleteReason('');
    }
  };

  const getRoleLabel = (c: any): string => {
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
            <IonIcon icon={peopleOutline} className="page-icon" />
            <h1>Customers</h1>
            <span className="customer-count">{activeCount} active{deletedCount > 0 ? ` / ${deletedCount} deleted` : ''}</span>
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

        <div className="customers-list">
          {isLoading ? (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>Loading customers...</p>
            </div>
          ) : isError ? (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>Failed to load customers. Please try again.</p>
              <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((customer: any, index: number) => {
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
                    <Card hover noPadding className="customer-card" onClick={() => toggleExpand(customer.id)}>
                      <div className="customer-main">
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
                                  onClick={(e) => { e.stopPropagation(); openDeleteConfirm(customer); }}
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
                                  <span className="detail-value">GH₵ {Number(customer.wallet_balance || 0).toFixed(2)}</span>
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
                              {!transactions || transactions.length === 0 ? (
                                <p className="no-data">No transactions recorded</p>
                              ) : (
                                <div className="detail-table">
                                  {transactions.map((t: any, i: number) => (
                                    <div key={t.id || i} className="detail-row">
                                      <span>{formatGhanaDate(t.created_at)}</span>
                                      <span className={t.type === 'credit' ? 'tx-credit' : 'tx-debit'}>
                                        {t.type === 'credit' ? '+' : '-'}GH₵ {(t.amount || 0).toFixed(2)}
                                      </span>
                                      <span>{t.description}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="detail-section">
                              <h4>Recent Orders</h4>
                              {!customerOrders || customerOrders.length === 0 ? (
                                <p className="no-data">No orders yet</p>
                              ) : (
                                <div className="detail-table">
                                  {customerOrders.map((o: any, i: number) => (
                                    <div key={o.id || i} className="detail-row">
                                      <span>{o.id?.slice(0, 8)}</span>
                                      <span>GH₵ {(o.amount || 0).toFixed(2)}</span>
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
          {!isLoading && filtered.length === 0 && (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>No customers found</p>
            </div>
          )}
        </div>
      </div>

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

      <IonAlert
        isOpen={showAlert}
        onDidDismiss={() => setShowAlert(false)}
        header={alertConfig.header}
        message={alertConfig.message}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Confirm', handler: () => { alertConfig.action(); } },
        ]}
      />

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
              <li>Personal information permanently scrubbed</li>
              <li>Account banned from logging in</li>
              <li>Role reset to User, wallet zeroed</li>
            </ul>
            <p className="retain-note">Financial records retained for audit.</p>
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
    </AdminLayout>
    </IonPage>
  );
};

export default CustomersPage;
