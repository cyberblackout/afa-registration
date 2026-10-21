import React, { useState } from 'react';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonModal,
  IonToast,
} from '@ionic/react';
import {
  cardOutline,
  searchOutline,
  checkmarkCircle,
  closeCircle,
  timeOutline,
  arrowForward,
  cashOutline,
  closeOutline,
  refreshOutline,
  checkmarkOutline,
  downloadOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminPaymentApi, notificationApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate, formatGhanaDateTime } from '../../utils/date';
import { safeNumber } from '../../utils/number';
import { M3SkeletonList } from '../../components/M3Skeleton';
import { M3ChipRow } from '../../components/M3ChipRow';
import { BatchActionSheet, BatchBar, type BatchAction } from '../../components/BatchActionSheet';
import { SecurityGate } from '../../components/SecurityGate';
import { recordAudit } from '../../services/auditLog';
import { downloadCsv } from '../../utils/csv';
import type { AdminPaymentRow } from '../../types';
import './PaymentsPage.css';

const PaymentsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [refunding, setRefunding] = useState(false);

  // ===== Multi-select + batch actions =====
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [gate, setGate] = useState<{ reason: string; run: () => void } | null>(null);

  const { data: payments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_payments'],
    queryFn: () => adminPaymentApi.list(),
  });

  const totalCollected = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + safeNumber(p.amount), 0);
  const pendingTotal = payments.filter((p) => p.status === 'pending').reduce((s, p) => s + safeNumber(p.amount), 0);
  const failedTotal = payments.filter((p) => p.status === 'failed').reduce((s, p) => s + safeNumber(p.amount), 0);
  const completedTotal = totalCollected;

  const filtered = payments.filter((p) => {
    const ref = p.reference || p.id || '';
    const name = p.profiles?.full_name || '';
    const matchSearch = ref.toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || (p.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchMethod = methodFilter === 'All' || (p.payment_method || '').toLowerCase() === methodFilter.toLowerCase().replace(' ', '');
    return matchSearch && matchStatus && matchMethod;
  });

  const openDetail = (p: AdminPaymentRow) => {
    setSelectedPayment(p);
    setShowModal(true);
  };

  const handleRefund = async () => {
    if (!selectedPayment) return;
    setRefunding(true);
    const paymentId = selectedPayment.id;
    const refundAmount = safeNumber(selectedPayment.amount);
    try {
      await adminPaymentApi.refund(
        selectedPayment.id,
        safeNumber(selectedPayment.amount),
        `Refund for ${selectedPayment.description}`,
        selectedPayment.user_id || ''
      );
      queryClient.invalidateQueries({ queryKey: ['admin_payments'] });
      setShowModal(false);
      recordAudit({
        action: 'payment_refund',
        entity: 'payment',
        entity_id: paymentId,
        status: 'success',
        details: { amount: refundAmount, reference: selectedPayment.reference || undefined },
      });
      setToastMessage(`Refund processed for ${selectedPayment.reference || selectedPayment.id}`);
      setShowToast(true);
    } catch (err) {
      recordAudit({
        action: 'payment_refund',
        entity: 'payment',
        entity_id: paymentId,
        status: 'failed',
        details: { amount: refundAmount, error: err instanceof Error ? err.message : 'unknown' },
      });
      setToastMessage(err instanceof Error ? err.message : 'Refund failed');
      setShowToast(true);
    } finally {
      setRefunding(false);
    }
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

  const selectedPayments = () => filtered.filter((p) => p.id && selected.has(p.id));

  const exportSelected = () => {
    const rows = selectedPayments();
    downloadCsv(
      'payments.csv',
      ['Reference', 'Customer', 'Amount (GH₵)', 'Method', 'Status', 'Date'],
      rows.map((p) => [
        p.reference || p.id || '',
        p.profiles?.full_name || 'Unknown',
        safeNumber(p.amount || 0).toFixed(2),
        p.payment_method || 'N/A',
        statusLabel(p.status || ''),
        formatGhanaDate(p.created_at || ''),
      ])
    );
    recordAudit({ action: 'batch_export', entity: 'payment', status: 'success', details: { count: rows.length, format: 'csv' } });
    setToastMessage(`Exported ${rows.length} payment${rows.length === 1 ? '' : 's'}`);
    setShowToast(true);
  };

  const sendBatchNotification = async (message: string) => {
    const ids = Array.from(new Set(selectedPayments().map((p) => p.user_id).filter((id): id is string => !!id)));
    if (ids.length === 0) {
      setToastMessage('Selected payments have no linked users');
      setShowToast(true);
      return;
    }
    try {
      await notificationApi.adminSend('Update from MTN AFA', message, 'info', ids);
      recordAudit({ action: 'batch_notification', entity: 'payment', status: 'success', details: { recipients: ids.length } });
      setToastMessage(`Notification sent to ${ids.length} user${ids.length === 1 ? '' : 's'}`);
      setShowToast(true);
    } catch (err) {
      recordAudit({
        action: 'batch_notification',
        entity: 'payment',
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

  const statusChips = [
    { value: 'All', label: 'All' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Failed', label: 'Failed' },
    { value: 'Refunded', label: 'Refunded' },
  ];

  const statCards = [
    { label: 'Total Collected', value: formatAmount(totalCollected), icon: cashOutline, color: '#2e7d32' },
    { label: 'Completed', value: formatAmount(completedTotal), icon: checkmarkCircle, color: '#1565c0' },
    { label: 'Pending', value: formatAmount(pendingTotal), icon: timeOutline, color: '#f57f17' },
    { label: 'Failed', value: formatAmount(failedTotal), icon: closeCircle, color: '#c62828' },
  ];

  const statusLabel = (s: string) => {
    if (!s) return 'Unknown';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_payments'] });
  };

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-payments-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={cardOutline} className="page-icon" />
            <h1>Payments</h1>
            <span className="page-count">{payments.length} total</span>
            <button type="button" className={`select-mode-btn ${selectMode ? 'select-mode-btn--on' : ''}`} onClick={toggleSelectMode}>
              {selectMode ? 'Done' : 'Select'}
            </button>
          </div>
        </motion.div>

        <div className="payments-summary">
          {statCards.map((stat, i) => (
            <motion.div key={stat.label} className="stat-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <div className="stat-card-icon" style={{ background: `${stat.color}15`, color: stat.color }}>
                <IonIcon icon={stat.icon} />
              </div>
              <div className="stat-card-info">
                <span className="stat-card-label">{stat.label}</span>
                <span className="stat-card-value">{stat.value}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="payments-section">
          <div className="filter-bar">
            <div className="search-wrapper">
              <IonIcon icon={searchOutline} className="search-icon" />
              <input type="text" placeholder="Search by reference or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
            </div>
            <div className="filter-controls">
              <div className="filter-item">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
                  <option value="All">All Status</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Failed">Failed</option>
                  <option value="Refunded">Refunded</option>
                </select>
              </div>
              <div className="filter-item">
                <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="filter-select">
                  <option value="All">All Methods</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Card">Card</option>
                  <option value="Bank">Bank</option>
                </select>
              </div>
            </div>
          </div>

          <M3ChipRow options={statusChips} value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" />

          <div className="payments-table-header">
            <span className="pth pth-ref">Reference</span>
            <span className="pth pth-customer">Customer</span>
            <span className="pth pth-amount">Amount</span>
            <span className="pth pth-method">Method</span>
            <span className="pth pth-date">Date</span>
            <span className="pth pth-status">Status</span>
            <span className="pth pth-action">Action</span>
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key="pay-skeleton">
                <M3SkeletonList count={6} lines={2} />
              </motion.div>
            ) : isError ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cardOutline} className="empty-icon" />
                <p>Failed to load payments. Please try again.</p>
                <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cardOutline} className="empty-icon" />
                <p>No payments found</p>
              </motion.div>
            ) : (
              <motion.div className="payments-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {filtered.map((payment, index) => (
                  <motion.div
                    key={payment.id}
                    className="payment-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => { if (selectMode && payment.id) toggleSelect(payment.id); }}
                  >
                    <div className="payment-card-row">
                      {selectMode && (
                        <button
                          type="button"
                          className={`cust-check ${payment.id && selected.has(payment.id) ? 'cust-check--on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); if (payment.id) toggleSelect(payment.id); }}
                          aria-label="Select payment"
                          aria-pressed={!!payment.id && selected.has(payment.id)}
                        >
                          {payment.id && selected.has(payment.id) && <IonIcon icon={checkmarkOutline} />}
                        </button>
                      )}
                      <span className="payment-ref">{payment.reference || payment.id?.slice(0, 8)}</span>
                      <span className={`payment-status-badge ${(payment.status || 'pending').toLowerCase()}`}>{statusLabel(payment.status || '')}</span>
                    </div>
                    <div className="payment-card-row">
                      <span className="payment-customer">{payment.profiles?.full_name || 'Unknown'}</span>
                      <span className="payment-amount">{formatAmount(safeNumber(payment.amount || 0))}</span>
                    </div>
                    <div className="payment-card-row">
                      <span className="payment-method">{payment.payment_method || 'N/A'}</span>
                      <span className="payment-date">{formatGhanaDate(payment.created_at || '')}</span>
                    </div>
                    <div className="payment-card-row">
                      <button className="view-payment-btn" onClick={() => openDetail(payment)}>
                        <IonIcon icon={arrowForward} />
                        <span>Details</span>
                      </button>
                    </div>

                    <div className="payment-table-row" onClick={() => (selectMode && payment.id ? toggleSelect(payment.id) : openDetail(payment))}>
                      {selectMode && (
                        <button
                          type="button"
                          className={`cust-check ${payment.id && selected.has(payment.id) ? 'cust-check--on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); if (payment.id) toggleSelect(payment.id); }}
                          aria-label="Select payment"
                          aria-pressed={!!payment.id && selected.has(payment.id)}
                        >
                          {payment.id && selected.has(payment.id) && <IonIcon icon={checkmarkOutline} />}
                        </button>
                      )}
                      <span className="ptd ptd-ref">{payment.reference || payment.id?.slice(0, 8)}</span>
                      <span className="ptd ptd-customer">{payment.profiles?.full_name || 'Unknown'}</span>
                      <span className="ptd ptd-amount">{formatAmount(safeNumber(payment.amount || 0))}</span>
                      <span className="ptd ptd-method">{payment.payment_method || 'N/A'}</span>
                      <span className="ptd ptd-date">{formatGhanaDate(payment.created_at || '')}</span>
                      <span className="ptd ptd-status">
                        <span className={`payment-status-badge ${(payment.status || 'pending').toLowerCase()}`}>{statusLabel(payment.status || '')}</span>
                      </span>
                      <span className="ptd ptd-action">
                        <button className="view-btn-icon" onClick={(e) => { e.stopPropagation(); openDetail(payment); }}>
                          <IonIcon icon={arrowForward} />
                        </button>
                      </span>
                    </div>
                  </motion.div>
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
        title="Payments"
        actions={batchActions}
        onComposeSend={sendBatchNotification}
        onClearSelection={clearSelection}
      />
    </AdminLayout>

      {/* Overlays must live at IonPage level, outside IonContent's scroll container. */}
      <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)} className="payment-detail-modal">
        {selectedPayment && (
          <div className="payment-modal-content">
            <div className="modal-header">
              <h2>Payment Details</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                <IonIcon icon={closeOutline} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-card">
                <div className="detail-card-title">Transaction Info</div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Reference</span>
                    <span className="detail-value mono">{selectedPayment.reference || selectedPayment.id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Amount</span>
                    <span className="detail-value amount-value">{formatAmount(safeNumber(selectedPayment.amount || 0))}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className={`payment-status-badge ${(selectedPayment.status || 'pending').toLowerCase()}`}>{statusLabel(selectedPayment.status || '')}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">{formatGhanaDateTime(selectedPayment.created_at || '')}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Payment Method</span>
                    <span className="detail-value">{selectedPayment.payment_method || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Description</span>
                    <span className="detail-value">{selectedPayment.description}</span>
                  </div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title">Customer Info</div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name</span>
                    <span className="detail-value">{selectedPayment.profiles?.full_name || 'Unknown'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{selectedPayment.profiles?.email || ''}</span>
                  </div>
                </div>
              </div>

              {selectedPayment.status === 'completed' && (
                <div className="detail-card">
                  <div className="detail-card-title">Action</div>
                  <IonButton
                    expand="block"
                    className="retry-btn"
                    onClick={() =>
                      setGate({
                        reason: `Refund GH₵ ${safeNumber(selectedPayment.amount).toFixed(2)} for ${selectedPayment.reference || selectedPayment.id}`,
                        run: () => void handleRefund(),
                      })
                    }
                    disabled={refunding}
                  >
                    <IonIcon icon={refreshOutline} slot="start" />
                    {refunding ? 'Processing...' : 'Refund Payment'}
                  </IonButton>
                </div>
              )}
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

export default PaymentsPage;
