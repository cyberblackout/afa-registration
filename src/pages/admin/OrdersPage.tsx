import React, { useState, useEffect } from 'react';
import {
  IonIcon,
  IonModal,
  IonPage,
  IonToast,
  IonButton,
} from '@ionic/react';
import {
  cartOutline,
  searchOutline,
  eyeOutline,
  walletOutline,
  cardOutline,
  personOutline,
  closeOutline,
  checkmarkOutline,
  checkmarkDoneOutline,
  closeCircle,
  downloadOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../../components/Card';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { orderApi, notificationApi } from '../../services/api';
import { offlineQueue } from '../../services/offlineQueue';
import type { Order } from '../../types';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate, formatGhanaDateTime } from '../../utils/date';
import { safeNumber } from '../../utils/number';
import { M3SkeletonList } from '../../components/M3Skeleton';
import { M3ChipRow } from '../../components/M3ChipRow';
import { BatchActionSheet, BatchBar, type BatchAction } from '../../components/BatchActionSheet';
import { SecurityGate } from '../../components/SecurityGate';
import { recordAudit } from '../../services/auditLog';
import { downloadCsv } from '../../utils/csv';
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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // ===== Multi-select + batch actions =====
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [gate, setGate] = useState<{ reason: string; run: () => void } | null>(null);

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_orders'],
    queryFn: () => orderApi.list(),
  });

  useEffect(() => {
    const channel = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const filtered = orders.filter((o) => {
    const matchSearch = (o.id || '').toLowerCase().includes(search.toLowerCase()) || (o.profiles?.full_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || (o.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const openDetail = (o: Order) => {
    setSelectedOrder(o);
    setShowModal(true);
  };

  const formatAmount = (amount: number) => `GH₵ ${safeNumber(amount).toFixed(2)}`;

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

  const selectedOrders = () => filtered.filter((o) => o.id && selected.has(o.id));

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const bulkSetStatus = async (status: 'approved' | 'rejected') => {
    const rows = selectedOrders();
    if (rows.length === 0) return;

    // Offline: queue every change and sync automatically on reconnect.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      rows.forEach((o) => offlineQueue.enqueue('order_status', `Order → ${status}`, { id: o.id, status }));
      queryClient.setQueryData<Order[]>(['admin_orders'], (old) =>
        old?.map((o) => (selected.has(o.id) ? { ...o, status } : o))
      );
      recordAudit({
        action: 'order_status',
        entity: 'order',
        status: 'queued',
        details: { count: rows.length, to_status: status },
      });
      setToastMessage(`${plural(rows.length, 'order')} queued — will sync when back online`);
      setShowToast(true);
      return;
    }

    const results = await Promise.allSettled(rows.map((o) => orderApi.updateStatus(o.id, status)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    await queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
    recordAudit({
      action: 'order_status',
      entity: 'order',
      status: failed > 0 ? 'failed' : 'success',
      details: { count: rows.length, ok, failed, to_status: status },
    });
    setToastMessage(failed > 0 ? `${plural(ok, 'order')} ${status}, ${plural(failed, 'failed')}` : `${plural(rows.length, 'order')} ${status}`);
    setShowToast(true);
  };

  const exportSelected = () => {
    const rows = selectedOrders();
    downloadCsv(
      'orders.csv',
      ['Order ID', 'Customer', 'Amount (GH₵)', 'Status', 'Date'],
      rows.map((o) => [
        o.id || '',
        o.profiles?.full_name || 'Unknown',
        safeNumber(o.amount || 0).toFixed(2),
        o.status || 'pending',
        formatGhanaDate(o.created_at),
      ])
    );
    recordAudit({ action: 'batch_export', entity: 'order', status: 'success', details: { count: rows.length, format: 'csv' } });
    setToastMessage(`Exported ${plural(rows.length, 'order')}`);
    setShowToast(true);
  };

  const sendBatchNotification = async (message: string) => {
    const ids = Array.from(new Set(selectedOrders().map((o) => o.user_id).filter(Boolean)));
    if (ids.length === 0) {
      setToastMessage('Selected orders have no linked users');
      setShowToast(true);
      return;
    }
    try {
      await notificationApi.adminSend('Update from MTN AFA', message, 'info', ids);
      recordAudit({ action: 'batch_notification', entity: 'order', status: 'success', details: { recipients: ids.length } });
      setToastMessage(`Notification sent to ${plural(ids.length, 'user')}`);
      setShowToast(true);
    } catch (err) {
      recordAudit({
        action: 'batch_notification',
        entity: 'order',
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
      key: 'approve',
      label: `Approve ${selected.size} selected`,
      icon: checkmarkDoneOutline,
      onRun: () =>
        setGate({
          reason: `Approve ${plural(selected.size, 'order')}`,
          run: () => void bulkSetStatus('approved'),
        }),
    },
    {
      key: 'reject',
      label: `Reject ${selected.size} selected`,
      icon: closeCircle,
      destructive: true,
      onRun: () =>
        setGate({
          reason: `Reject ${plural(selected.size, 'order')}`,
          run: () => void bulkSetStatus('rejected'),
        }),
    },
    { key: 'export', label: 'Export selected as CSV', icon: downloadOutline, onRun: exportSelected },
    {
      key: 'notify',
      label: 'Send notification',
      icon: chatbubblesOutline,
      compose: { placeholder: 'Type the message to send to selected users…' },
    },
  ];

  const statusChips = [
    { value: 'All', label: 'All' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'Cancelled', label: 'Cancelled' },
  ];

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
  };

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-orders-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={cartOutline} className="page-icon" />
            <h1>Orders</h1>
            <span className="page-count">{orders.length} total</span>
            <button type="button" className={`select-mode-btn ${selectMode ? 'select-mode-btn--on' : ''}`} onClick={toggleSelectMode}>
              {selectMode ? 'Done' : 'Select'}
            </button>
          </div>
        </motion.div>

        <div className="orders-section">
          <Card noPadding className="filter-bar">
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
          </Card>

          <M3ChipRow options={statusChips} value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" />

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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="orders-skeleton">
                <M3SkeletonList count={6} lines={2} />
              </motion.div>
            ) : isError ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cartOutline} className="empty-icon" />
                <p>Failed to load orders. Please try again.</p>
                <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cartOutline} className="empty-icon" />
                <p>No orders found</p>
              </motion.div>
            ) : (
              <motion.div className="orders-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {filtered.map((order, index) => (
                  <Card
                    key={order.id}
                    className="order-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => { if (selectMode && order.id) toggleSelect(order.id); }}
                  >
                    <div className="order-card-row">
                      {selectMode && (
                        <button
                          type="button"
                          className={`cust-check ${selected.has(order.id) ? 'cust-check--on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelect(order.id); }}
                          aria-label="Select order"
                          aria-pressed={selected.has(order.id)}
                        >
                          {selected.has(order.id) && <IonIcon icon={checkmarkOutline} />}
                        </button>
                      )}
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
                      <span className="order-date">{formatGhanaDate(order.created_at)}</span>
                    </div>
                    <div className="order-card-row">
                      <button className="view-order-btn" onClick={() => openDetail(order)}>
                        <IonIcon icon={eyeOutline} />
                        <span>View</span>
                      </button>
                    </div>

                    <div className="order-table-row" onClick={() => (selectMode ? toggleSelect(order.id) : openDetail(order))}>
                      {selectMode && (
                        <button
                          type="button"
                          className={`cust-check ${selected.has(order.id) ? 'cust-check--on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelect(order.id); }}
                          aria-label="Select order"
                          aria-pressed={selected.has(order.id)}
                        >
                          {selected.has(order.id) && <IonIcon icon={checkmarkOutline} />}
                        </button>
                      )}
                      <span className="otd otd-id">{order.id?.slice(0, 8)}</span>
                      <span className="otd otd-customer">{order.profiles?.full_name || 'Unknown'}</span>
                      <span className="otd otd-items">{order.description || 'N/A'}</span>
                      <span className="otd otd-total">{formatAmount(order.amount || 0)}</span>
                      <span className="otd otd-date">{formatGhanaDate(order.created_at)}</span>
                      <span className="otd otd-status">
                        <span className="order-status-badge" style={{ background: statusBgColors[order.status] || '#f5f5f5', color: statusColors[order.status] || '#333' }}>
                          {order.status || 'pending'}
                        </span>
                      </span>
                      <span className="otd otd-actions">
                        <button className="action-icon-btn" onClick={(e) => { e.stopPropagation(); openDetail(order); }} title="View">
                          <IonIcon icon={eyeOutline} />
                        </button>
                      </span>
                    </div>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {selectMode && selected.size > 0 && (
        <BatchBar count={selected.size} onActions={() => setBatchOpen(true)} onClear={clearSelection} />
      )}
      <BatchActionSheet
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        count={selected.size}
        title="Orders"
        actions={batchActions}
        onComposeSend={sendBatchNotification}
        onClearSelection={clearSelection}
      />
    </AdminLayout>

      {/* Overlays must live at IonPage level, outside IonContent's scroll container. */}
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
              <Card variant="bordered" className="detail-card">
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
                    <span className="detail-value">{formatGhanaDateTime(selectedOrder.created_at)}</span>
                  </div>
                </div>
              </Card>

              <Card variant="bordered" className="detail-card">
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
              </Card>

              <Card variant="bordered" className="detail-card">
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
              </Card>

              <Card variant="bordered" className="detail-card">
                <div className="detail-card-title"><IonIcon icon={walletOutline} /> Payment Status</div>
                <span className={`payment-status-badge ${(selectedOrder.payment_status || 'unpaid').toLowerCase()}`}>
                  {selectedOrder.payment_status || 'Unpaid'}
                </span>
              </Card>
            </div>
          </div>
        )}
      </IonModal>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={3000} position="top" color="success" />

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

export default OrdersPage;
