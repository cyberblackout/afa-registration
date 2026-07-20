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
  IonTextarea,
} from '@ionic/react';
import {
  searchOutline,
  createOutline,
  banOutline,
  checkmarkCircle,
  trashOutline,
  chevronDownOutline,
  chevronUpOutline,
  walletOutline,
  cartOutline,
  cardOutline,
  logInOutline,
  closeOutline,
  peopleOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
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

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['admin_customers'],
    queryFn: async () => {
      const r = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return r.data || [];
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ['admin_customer_transactions', expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const r = await supabase.from('wallet_transactions').select('*').eq('user_id', expandedId).order('created_at', { ascending: false }).limit(10);
      return r.data || [];
    },
    enabled: !!expandedId,
  });

  const { data: customerOrders } = useQuery({
    queryKey: ['admin_customer_orders', expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const r = await supabase.from('orders').select('*').eq('user_id', expandedId).order('created_at', { ascending: false }).limit(10);
      return r.data || [];
    },
    enabled: !!expandedId,
  });

  const filtered = customers.filter((c: any) =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

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
    await supabase.from('profiles').update({ full_name: editName, email: editEmail, phone: editPhone }).eq('id', editCustomer.id);
    queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
    setShowEditModal(false);
    setEditCustomer(null);
    setToastMessage('Customer details updated successfully');
    setShowToast(true);
  };

  const toggleRole = (c: any) => {
    const isAdmin = c.role === 'admin';
    const newRole = isAdmin ? 'user' : 'admin';
    setAlertConfig({
      header: `${isAdmin ? 'Demote' : 'Promote'} Customer`,
      message: `Are you sure you want to ${isAdmin ? 'demote' : 'promote'} ${c.full_name} to ${newRole}?`,
      action: async () => {
        await supabase.from('profiles').update({ role: newRole }).eq('id', c.id);
        queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
        setToastMessage(`${c.full_name} is now ${newRole}`);
        setShowToast(true);
      },
    });
    setShowAlert(true);
  };

  const showToastMsg = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  };

  const getRoleLabel = (c: any): string => {
    if (c.role === 'admin') return 'Admin';
    return 'User';
  };

  return (
    <AdminLayout>
      <div className="admin-customers-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={peopleOutline} className="page-icon" />
            <h1>Customers</h1>
            <span className="customer-count">{customers.length} total</span>
          </div>
          <div className="search-bar">
            <IonIcon icon={searchOutline} className="search-icon" />
            <input type="text" placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>
        </motion.div>

        <div className="customers-list">
          {isLoading ? (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>Loading customers...</p>
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
                    <div className="customer-card" onClick={() => toggleExpand(customer.id)}>
                      <div className="customer-main">
                        <div className={`status-dot ${customer.role === 'admin' ? 'dot-active' : 'dot-suspended'}`} />
                        <div className="customer-info">
                          <span className="customer-name">{customer.full_name || 'Unknown'}</span>
                          <span className="customer-email">{customer.email}</span>
                        </div>
                        <div className="customer-meta">
                          <span className="customer-phone">{customer.phone}</span>
                          <span className={`customer-status ${customer.role === 'admin' ? 'status-active' : 'status-suspended'}`}>{roleLabel}</span>
                          <span className="customer-date">{new Date(customer.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="customer-actions">
                          <button className="action-btn edit-btn" onClick={(e) => { e.stopPropagation(); openEdit(customer); }} title="Edit">
                            <IonIcon icon={createOutline} />
                          </button>
                          <button className="action-btn toggle-role-btn" onClick={(e) => { e.stopPropagation(); toggleRole(customer); }} title={customer.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}>
                            <IonIcon icon={customer.role === 'admin' ? banOutline : checkmarkCircle} />
                          </button>
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
                                  <span className="detail-value">GH₵ {(customer.wallet_balance || 0).toFixed(2)}</span>
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
                                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
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
                    </div>
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

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color="success"
      />
    </AdminLayout>
  );
};

export default CustomersPage;
