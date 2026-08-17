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
  IonBadge,
  IonSelect,
  IonSelectOption,
} from '@ionic/react';
import {
  cardOutline,
  searchOutline,
  checkmarkCircle,
  closeCircle,
  timeOutline,
  arrowForward,
  cashOutline,
  walletOutline,
  trendingUpOutline,
  trendingDownOutline,
  closeOutline,
  refreshOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminPaymentApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import './PaymentsPage.css';

const PaymentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [refunding, setRefunding] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['admin_payments'],
    queryFn: () => adminPaymentApi.list() as any,
  });

  const totalCollected = payments.filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const pendingTotal = payments.filter((p: any) => p.status === 'pending').reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const failedTotal = payments.filter((p: any) => p.status === 'failed').reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const completedTotal = totalCollected;

  const filtered = payments.filter((p: any) => {
    const ref = p.reference || p.id || '';
    const name = p.profiles?.full_name || '';
    const matchSearch = ref.toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || (p.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchMethod = methodFilter === 'All' || (p.payment_method || '').toLowerCase() === methodFilter.toLowerCase().replace(' ', '');
    return matchSearch && matchStatus && matchMethod;
  });

  const openDetail = (p: any) => {
    setSelectedPayment(p);
    setShowModal(true);
  };

  const handleRefund = async () => {
    if (!selectedPayment) return;
    setRefunding(true);
    try {
      await adminPaymentApi.refund(
        selectedPayment.id,
        selectedPayment.amount,
        `Refund for ${selectedPayment.description}`,
        selectedPayment.user_id
      );
      queryClient.invalidateQueries({ queryKey: ['admin_payments'] });
      setShowModal(false);
      setToastMessage(`Refund processed for ${selectedPayment.reference || selectedPayment.id}`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Refund failed');
      setShowToast(true);
    } finally {
      setRefunding(false);
    }
  };

  const formatAmount = (amount: number) => `GH₵ ${amount.toFixed(2)}`;

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

  return (
    <AdminLayout>
      <div className="admin-payments-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={cardOutline} className="page-icon" />
            <h1>Payments</h1>
            <span className="page-count">{payments.length} total</span>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cardOutline} className="empty-icon" />
                <p>Loading payments...</p>
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty-state">
                <IonIcon icon={cardOutline} className="empty-icon" />
                <p>No payments found</p>
              </motion.div>
            ) : (
              <motion.div className="payments-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {filtered.map((payment: any, index: number) => (
                  <motion.div key={payment.id} className="payment-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                    <div className="payment-card-row">
                      <span className="payment-ref">{payment.reference || payment.id?.slice(0, 8)}</span>
                      <span className={`payment-status-badge ${(payment.status || 'pending').toLowerCase()}`}>{statusLabel(payment.status)}</span>
                    </div>
                    <div className="payment-card-row">
                      <span className="payment-customer">{payment.profiles?.full_name || 'Unknown'}</span>
                      <span className="payment-amount">{formatAmount(payment.amount || 0)}</span>
                    </div>
                    <div className="payment-card-row">
                      <span className="payment-method">{payment.payment_method || 'N/A'}</span>
                      <span className="payment-date">{new Date(payment.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="payment-card-row">
                      <button className="view-payment-btn" onClick={() => openDetail(payment)}>
                        <IonIcon icon={arrowForward} />
                        <span>Details</span>
                      </button>
                    </div>

                    <div className="payment-table-row" onClick={() => openDetail(payment)}>
                      <span className="ptd ptd-ref">{payment.reference || payment.id?.slice(0, 8)}</span>
                      <span className="ptd ptd-customer">{payment.profiles?.full_name || 'Unknown'}</span>
                      <span className="ptd ptd-amount">{formatAmount(payment.amount || 0)}</span>
                      <span className="ptd ptd-method">{payment.payment_method || 'N/A'}</span>
                      <span className="ptd ptd-date">{new Date(payment.created_at).toLocaleDateString()}</span>
                      <span className="ptd ptd-status">
                        <span className={`payment-status-badge ${(payment.status || 'pending').toLowerCase()}`}>{statusLabel(payment.status)}</span>
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
                    <span className="detail-value amount-value">{formatAmount(selectedPayment.amount || 0)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className={`payment-status-badge ${(selectedPayment.status || 'pending').toLowerCase()}`}>{statusLabel(selectedPayment.status)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">{new Date(selectedPayment.created_at).toLocaleString()}</span>
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
                  <IonButton expand="block" className="retry-btn" onClick={handleRefund} disabled={refunding}>
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
    </AdminLayout>
  );
};

export default PaymentsPage;
