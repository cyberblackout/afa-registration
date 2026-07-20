import React, { useState, useEffect } from 'react';
import {
  IonIcon,
  IonModal,
  IonToast,
  IonBadge,
} from '@ionic/react';
import {
  cartOutline,
  searchOutline,
  eyeOutline,
  checkmarkCircle,
  closeCircle,
  banOutline,
  timeOutline,
  arrowForward,
  walletOutline,
  cardOutline,
  personOutline,
  closeOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
import './OrdersPage.css';

const statusColors: Record<string, string> = {
  pending: '#f57f17',
  approved: '#2e7d32',
  rejected: '#c62828',
  cancelled: '#757575',
};

const statusBgColors: Record<string, string> = {
  pending: '#fff8e1',
  approved: '#e8f5e9',
  rejected: '#fce4ec',
  cancelled: '#f5f5f5',
};

const OrdersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [updating, setUpdating] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['admin_orders'],
    queryFn: async () => {
      const r = await supabase.from('orders').select('*, profiles(full_name, email, phone)').order('created_at', { ascending: false });
      return r.data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = orders.filter((o: any) => {
    const matchSearch = (o.id || '').toLowerCase().includes(search.toLowerCase()) || (o.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || (o.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const openDetail = (o: any) => {
    setSelectedOrder(o);
    setShowModal(true);
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdating(true);
    try {
      await supabase.from('orders').update({ status }).eq('id', id);
      queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
      setShowModal(false);
      setToastMessage(`Order ${id?.slice(0, 8)} ${status.toLowerCase()} successfully`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Update failed');
      setShowToast(true);
    } finally {
      setUpdating(false);
    }
  };

  const formatAmount = (amount: number) => `GH₵ ${amount.toFixed(2)}`;

  return (
    <AdminLayout>
      <div className="admin-orders-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={cartOutline} className="page-icon" />
            <h1>Orders</h1>
            <span className="page-count">{orders.length} total</span>
          </div>
        </motion.div>

        <div className="orders-section">
          <div className="filter-bar">
            <div className="search-wrapper">
              <IonIcon icon={searchOutline} className="search-icon" />
              <input type="text" placeholder="Search by order ID or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
            </div>
            <div className="filter-controls">
              <div className="filter-item">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          <div className="orders-table-header">
            <span className="oth oth-id">Order ID</span>
            <span className="oth oth-customer">Customer</span>
            <span className="oth oth-items">Items</span>
            <span className="oth oth-total">Total</span>
            <span className="oth oth-date">Date</span>
            <span className="oth oth-status">Status</span>
            <span className="oth oth-actions">Actions</span>
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cartOutline} className="empty-icon" />
                <p>Loading orders...</p>
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cartOutline} className="empty-icon" />
                <p>No orders found</p>
              </motion.div>
            ) : (
              <motion.div className="orders-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {filtered.map((order: any, index: number) => (
                  <motion.div key={order.id} className="order-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                    <div className="order-card-row">
                      <span className="order-id">{order.id?.slice(0, 8)}</span>
                      <span className="order-status-badge" style={{ background: statusBgColors[order.status] || '#f5f5f5', color: statusColors[order.status] || '#333' }}>
                        {order.status || 'pending'}
                      </span>
                    </div>
                    <div className="order-card-row">
                      <span className="order-customer">{order.profiles?.full_name || 'Unknown'}</span>
                      <span className="order-total">{formatAmount(order.amount || 0)}</span>
                    </div>
                    <div className="order-card-row">
                      <span className="order-items">{order.description || 'N/A'}</span>
                      <span className="order-date">{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="order-card-row">
                      <button className="view-order-btn" onClick={() => openDetail(order)}>
                        <IonIcon icon={eyeOutline} />
                        <span>View</span>
                      </button>
                    </div>

                    <div className="order-table-row" onClick={() => openDetail(order)}>
                      <span className="otd otd-id">{order.id?.slice(0, 8)}</span>
                      <span className="otd otd-customer">{order.profiles?.full_name || 'Unknown'}</span>
                      <span className="otd otd-items">{order.description || 'N/A'}</span>
                      <span className="otd otd-total">{formatAmount(order.amount || 0)}</span>
                      <span className="otd otd-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      <span className="otd otd-status">
                        <span className="order-status-badge" style={{ background: statusBgColors[order.status] || '#f5f5f5', color: statusColors[order.status] || '#333' }}>
                          {order.status || 'pending'}
                        </span>
                      </span>
                      <span className="otd otd-actions">
                        <button className="action-icon-btn" onClick={(e) => { e.stopPropagation(); openDetail(order); }} title="View">
                          <IonIcon icon={eyeOutline} />
                        </button>
                        {(order.status || '') === 'pending' && (
                          <>
                            <button className="action-icon-btn approve-icon" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'approved'); }} title="Approve">
                              <IonIcon icon={checkmarkCircle} />
                            </button>
                            <button className="action-icon-btn reject-icon" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'rejected'); }} title="Reject">
                              <IonIcon icon={closeCircle} />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)} className="order-detail-modal">
        {selectedOrder && (
          <div className="order-modal-content">
            <div className="modal-header">
              <h2>Order Details</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                <IonIcon icon={closeOutline} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-card">
                <div className="detail-card-title"><IonIcon icon={cartOutline} /> Order Info</div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Order ID</span>
                    <span className="detail-value mono">{selectedOrder.id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className="order-status-badge" style={{ background: statusBgColors[selectedOrder.status] || '#f5f5f5', color: statusColors[selectedOrder.status] || '#333' }}>
                      {selectedOrder.status || 'pending'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Total</span>
                    <span className="detail-value amount-value">{formatAmount(selectedOrder.amount || 0)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title"><IonIcon icon={personOutline} /> Customer Info</div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name</span>
                    <span className="detail-value">{selectedOrder.profiles?.full_name || 'Unknown'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{selectedOrder.profiles?.email || ''}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">{selectedOrder.profiles?.phone || ''}</span>
                  </div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title"><IonIcon icon={cardOutline} /> Order Details</div>
                <div className="order-items-list">
                  <div className="order-item-row">
                    <span className="order-item-name">{selectedOrder.description || 'Order'}</span>
                    <span className="order-item-meta">
                      <span className="order-item-price">{formatAmount(selectedOrder.amount || 0)}</span>
                    </span>
                  </div>
                </div>
                <div className="order-total-row">
                  <span>Total</span>
                  <span className="order-total-amount">{formatAmount(selectedOrder.amount || 0)}</span>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title"><IonIcon icon={walletOutline} /> Payment Status</div>
                <span className={`payment-status-badge ${(selectedOrder.payment_status || 'unpaid').toLowerCase()}`}>
                  {selectedOrder.payment_status || 'Unpaid'}
                </span>
              </div>

              <div className="modal-actions">
                {(selectedOrder.status || '') === 'pending' && (
                  <>
                    <button className="action-btn approve-action" disabled={updating} onClick={() => updateStatus(selectedOrder.id, 'approved')}>
                      <IonIcon icon={checkmarkCircle} />
                      <span>Approve</span>
                    </button>
                    <button className="action-btn reject-action" disabled={updating} onClick={() => updateStatus(selectedOrder.id, 'rejected')}>
                      <IonIcon icon={closeCircle} />
                      <span>Reject</span>
                    </button>
                  </>
                )}
                {(selectedOrder.status || '') !== 'cancelled' && (selectedOrder.status || '') !== 'rejected' && (
                  <button className="action-btn cancel-action" disabled={updating} onClick={() => updateStatus(selectedOrder.id, 'cancelled')}>
                    <IonIcon icon={banOutline} />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </IonModal>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={3000} position="top" color="success" />
    </AdminLayout>
  );
};

export default OrdersPage;
