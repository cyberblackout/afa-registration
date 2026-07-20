import React, { useState } from 'react';
import {
  IonIcon,
  IonToast,
  IonPage,
} from '@ionic/react';
import {
  cartOutline,
  searchOutline,
  funnelOutline,
  eyeOutline,
  printOutline,
  downloadOutline,
  chevronBack,
  closeOutline,
  checkmarkCircle,
  timeOutline,
  alertCircle,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import { Order } from '../types';
import DashboardLayout from '../layouts/DashboardLayout';
import './OrdersPage.css';

const ITEMS_PER_PAGE = 6;

const statusColors: Record<string, string> = {
  pending: '#f57f17',
  processing: '#1565c0',
  completed: '#2e7d32',
  cancelled: '#c62828',
  failed: '#c62828',
  approved: '#2e7d32',
  rejected: '#c62828',
};

const statusBgColors: Record<string, string> = {
  pending: '#fff8e1',
  processing: '#e3f2fd',
  completed: '#e8f5e9',
  cancelled: '#fce4ec',
  failed: '#fce4ec',
  approved: '#e8f5e9',
  rejected: '#fce4ec',
};

const OrdersPage: React.FC = () => {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('Newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Order[];
    },
    enabled: !!user?.id,
  });

  const filteredOrders = orders.filter((order) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      order.id.toLowerCase().includes(query) ||
      (order.customer_name || '').toLowerCase().includes(query) ||
      (order.customer_phone || '').includes(query) ||
      (order.description || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'All' || order.status === statusFilter.toLowerCase();

    let matchesDate = true;
    if (dateFilter !== 'All') {
      const orderDate = new Date(order.created_at);
      const now = new Date();
      if (dateFilter === 'Today') {
        matchesDate = orderDate.toDateString() === now.toDateString();
      } else if (dateFilter === 'This Week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = orderDate >= weekAgo;
      } else if (dateFilter === 'This Month') {
        matchesDate = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'Newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'Oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'Highest Amount') return b.amount - a.amount;
    if (sortBy === 'Lowest Amount') return a.amount - b.amount;
    return 0;
  });

  const totalPages = Math.ceil(sortedOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = sortedOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const openDetail = (order: Order) => {
    setSelectedOrder(order);
  };

  const closeDetail = () => {
    setSelectedOrder(null);
  };

  return (
    <IonPage>
        <DashboardLayout>
          <div className="orders-page">
        <motion.div
          className="page-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="page-header-left">
            <IonIcon icon={cartOutline} className="page-header-icon" />
            <h1>Orders</h1>
          </div>
          <span className="page-header-count">{orders.length} total</span>
        </motion.div>

        <div className="filter-bar">
          <div className="search-wrapper">
            <IonIcon icon={searchOutline} className="search-icon" />
            <input
              type="text"
              placeholder="Search by ID, customer, phone or description..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="search-input"
            />
          </div>
          <div className="filter-controls">
            <div className="filter-item">
              <IonIcon icon={funnelOutline} className="filter-icon" />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="filter-select"
              >
                <option value="All">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="filter-item">
              <select
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                className="filter-select"
              >
                <option value="All">All Dates</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
            </div>
            <div className="filter-item">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="filter-select"
              >
                <option value="Newest">Newest First</option>
                <option value="Oldest">Oldest First</option>
                <option value="Highest Amount">Highest Amount</option>
                <option value="Lowest Amount">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>

        <div className="orders-table-header">
          <span className="th th-id">Order ID</span>
          <span className="th th-customer">Customer</span>
          <span className="th th-phone">Phone</span>
          <span className="th th-date">Date</span>
          <span className="th th-status">Status</span>
          <span className="th th-payment">Payment</span>
          <span className="th th-amount">Amount</span>
          <span className="th th-action">Action</span>
        </div>

        {isLoading ? (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <IonIcon icon={cartOutline} className="empty-icon" />
            <h3>Loading orders...</h3>
          </motion.div>
        ) : isError ? (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <IonIcon icon={cartOutline} className="empty-icon" />
            <h3>Failed to load orders</h3>
            <p>Please try again later</p>
            <button className="view-btn" onClick={() => refetch()}>Retry</button>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {paginatedOrders.length === 0 ? (
              <motion.div
                className="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <IonIcon icon={cartOutline} className="empty-icon" />
                <h3>No orders found</h3>
                <p>Try adjusting your search or filter criteria</p>
              </motion.div>
            ) : (
              <motion.div
                className="orders-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {paginatedOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    className="order-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <div className="order-card-row">
                      <div className="order-card-field id-field">
                        <span className="field-label">Order ID</span>
                        <span className="field-value id-value">{order.id}</span>
                      </div>
                      <div className="order-card-field status-field">
                        <span
                          className="status-badge"
                          style={{
                            background: statusBgColors[order.status] || '#fff8e1',
                            color: statusColors[order.status] || '#f57f17',
                          }}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                    <div className="order-card-row">
                      <div className="order-card-field">
                        <span className="field-label">Customer</span>
                        <span className="field-value">{order.customer_name || '—'}</span>
                      </div>
                      <div className="order-card-field">
                        <span className="field-label">Phone</span>
                        <span className="field-value">{order.customer_phone || '—'}</span>
                      </div>
                    </div>
                    <div className="order-card-row">
                      <div className="order-card-field">
                        <span className="field-label">Date</span>
                        <span className="field-value">{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="order-card-field">
                        <span className="field-label">Amount</span>
                        <span className="field-value amount-value">GH₵ {order.amount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="order-card-row">
                      <div className="order-card-field">
                        <span className="field-label">Payment</span>
                        <span
                          className="payment-badge"
                          style={{
                            background: order.payment_status === 'Paid' ? '#e8f5e9' : '#fff8e1',
                            color: order.payment_status === 'Paid' ? '#2e7d32' : '#f57f17',
                          }}
                        >
                          {order.payment_status || 'Unpaid'}
                        </span>
                      </div>
                      <div className="order-card-field action-field">
                        <button className="view-btn" onClick={() => openDetail(order)}>
                          <IonIcon icon={eyeOutline} />
                          <span>View Details</span>
                        </button>
                      </div>
                    </div>

                    <div className="order-table-row" onClick={() => openDetail(order)}>
                      <span className="td td-id">{order.id}</span>
                      <span className="td td-customer">{order.customer_name || '—'}</span>
                      <span className="td td-phone">{order.customer_phone || '—'}</span>
                      <span className="td td-date">{new Date(order.created_at).toLocaleDateString()}</span>
                      <span className="td td-status">
                        <span
                          className="status-badge"
                          style={{
                            background: statusBgColors[order.status] || '#fff8e1',
                            color: statusColors[order.status] || '#f57f17',
                          }}
                        >
                          {order.status}
                        </span>
                      </span>
                      <span className="td td-payment">
                        <span
                          className="payment-badge"
                          style={{
                            background: order.payment_status === 'Paid' ? '#e8f5e9' : '#fff8e1',
                            color: order.payment_status === 'Paid' ? '#2e7d32' : '#f57f17',
                          }}
                        >
                          {order.payment_status || 'Unpaid'}
                        </span>
                      </span>
                      <span className="td td-amount">GH₵ {order.amount.toFixed(2)}</span>
                      <span className="td td-action">
                        <button className="view-btn-icon" onClick={(e) => { e.stopPropagation(); openDetail(order); }}>
                          <IonIcon icon={eyeOutline} />
                        </button>
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`page-btn ${currentPage === page ? 'page-active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetail}
          >
            <motion.div
              className="modal-content order-detail-modal"
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <button className="modal-back" onClick={closeDetail}>
                  <IonIcon icon={chevronBack} />
                </button>
                <h3>Order Details</h3>
                <button className="modal-close" onClick={closeDetail}>
                  <IonIcon icon={closeOutline} />
                </button>
              </div>

              <div className="detail-body">
                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={cartOutline} />
                    <span>Order Info</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Order ID</span>
                      <span className="detail-value">{selectedOrder.id}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Date Placed</span>
                      <span className="detail-value">{new Date(selectedOrder.created_at).toLocaleString()}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Status</span>
                      <span
                        className="status-badge"
                        style={{
                          background: statusBgColors[selectedOrder.status] || '#fff8e1',
                          color: statusColors[selectedOrder.status] || '#f57f17',
                        }}
                      >
                        {selectedOrder.status}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Description</span>
                      <span className="detail-value">{selectedOrder.description || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={checkmarkCircle} />
                    <span>Customer Info</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Name</span>
                      <span className="detail-value">{selectedOrder.customer_name || '—'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">{selectedOrder.customer_phone || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={cartOutline} />
                    <span>Items & Pricing</span>
                  </div>
                  <div className="items-list">
                    <div className="item-row">
                      <div className="item-info">
                        <span className="item-name">{selectedOrder.description || 'Order'}</span>
                      </div>
                      <span className="item-price">GH₵ {selectedOrder.amount.toFixed(2)}</span>
                    </div>
                    <div className="item-row item-total">
                      <span>Total</span>
                      <span>GH₵ {selectedOrder.amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={checkmarkCircle} />
                    <span>Payment Details</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Payment Status</span>
                      <span
                        className="payment-badge"
                        style={{
                          background: selectedOrder.payment_status === 'Paid' ? '#e8f5e9' : '#fff8e1',
                          color: selectedOrder.payment_status === 'Paid' ? '#2e7d32' : '#f57f17',
                        }}
                      >
                        {selectedOrder.payment_status || 'Unpaid'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Total Amount</span>
                      <span className="detail-value amount-value">GH₵ {selectedOrder.amount.toFixed(2)}</span>
                    </div>
                    {selectedOrder.payment_method && (
                      <div className="detail-item">
                        <span className="detail-label">Payment Method</span>
                        <span className="detail-value">{selectedOrder.payment_method}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="action-btn print-btn" onClick={() => window.print()}>
                  <IonIcon icon={printOutline} />
                  <span>Print</span>
                </button>
                <button className="action-btn download-btn" onClick={() => {
                          const content = [
                            'Order Details',
                            '-----------',
                            `Order ID: ${selectedOrder.id}`,
                            `Customer: ${selectedOrder.customer_name || 'N/A'}`,
                            `Amount: GH₵ ${selectedOrder.amount.toFixed(2)}`,
                            `Status: ${selectedOrder.status}`,
                            `Date: ${new Date(selectedOrder.created_at).toLocaleString()}`,
                          ].join('\n');
                          const blob = new Blob([content], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `order-${selectedOrder.id}.txt`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          setToastMessage('Order details downloaded');
                          setShowToast(true);
                        }}>
                  <IonIcon icon={downloadOutline} />
                  <span>Download PDF</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={3000} position="top" color="success" />
        </DashboardLayout>
    </IonPage>
  );
};

export default OrdersPage;
