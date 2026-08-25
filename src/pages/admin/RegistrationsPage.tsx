import React, { useState, useEffect } from 'react';
import {
  IonIcon,
  IonToast,
  IonButton,
} from '@ionic/react';
import {
  searchOutline,
  funnelOutline,
  eyeOutline,
  checkmarkCircle,
  closeCircle,
  downloadOutline,
  printOutline,
  timeOutline,
  arrowForward,
  chevronBack,
  documentTextOutline,
  cameraOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { registrationApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import AdminLayout from '../../layouts/AdminLayout';
import {
  formatGhanaDate,
  formatGhanaDateUS,
  formatGhanaDateTime,
  getGhanaTodayISO,
} from '../../utils/date';
import './RegistrationsPage.css';

const statusColors: Record<string, string> = {
  pending: '#f57f17',
  processing: '#1565c0',
  approved: '#2e7d32',
  rejected: '#c62828',
  cancelled: '#757575',
};

const statusBgColors: Record<string, string> = {
  pending: '#fff8e1',
  processing: '#e3f2fd',
  approved: '#e8f5e9',
  rejected: '#fce4ec',
  cancelled: '#f5f5f5',
};

const networkColors: Record<string, string> = {
  MTN: '#FFCB05',
  Vodafone: '#cc0000',
  AirtelTigo: '#ed1c24',
};

const networkBgColors: Record<string, string> = {
  MTN: '#fff8e1',
  Vodafone: '#fce4ec',
  AirtelTigo: '#fce4ec',
};

const ITEMS_PER_PAGE = 8;

const RegistrationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [adminNotes, setAdminNotes] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const { data: registrations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_registrations'],
    queryFn: () => registrationApi.adminList() as any,
  });

  useEffect(() => {
    const channel = supabase.channel('admin-registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin_registrations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredRegs = registrations.filter((reg: any) => {
    const name = reg.full_name || '';
    const phone = reg.phone || '';
    const id = reg.id || '';
    const matchesSearch =
      id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'All' || reg.status === statusFilter.toLowerCase();
    let matchesDate = true;
    if (dateFilter === 'Today') {
      const todayStr = new Date().toISOString().split('T')[0];
      matchesDate = reg.created_at?.startsWith(todayStr);
    } else if (dateFilter === 'This Week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchesDate = new Date(reg.created_at) >= weekAgo;
    } else if (dateFilter === 'This Month') {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      matchesDate = new Date(reg.created_at) >= monthStart;
    }
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalPages = Math.ceil(filteredRegs.length / ITEMS_PER_PAGE);
  const paginatedRegs = filteredRegs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const updateStatus = async (id: string, status: string) => {
    setStatusLoading(true);
    try {
      await registrationApi.adminUpdateStatus(id, status, adminNotes, userMessage || undefined);
      queryClient.invalidateQueries({ queryKey: ['admin_registrations'] });
      queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
      setSelectedReg(null);
      setToastMessage(`Registration ${status}`);
      setShowToast(true);
    } catch (err: any) {
      console.error('Status update error:', err);
      setToastMessage(err.message || 'Failed to update status');
      setShowToast(true);
    } finally {
      setStatusLoading(false);
    }
  };

  const openDetail = (reg: any) => {
    setSelectedReg(reg);
    setAdminNotes(reg.admin_notes || '');
    setUserMessage(reg.user_message || '');
  };

  const closeDetail = () => {
    setSelectedReg(null);
  };

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (bulkSelected.size === paginatedRegs.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(paginatedRegs.map((r: any) => r.id)));
    }
  };

  const formatDate = (dateStr: string) => {
    return formatGhanaDateUS(dateStr);
  };

  const formatDateTime = (dateStr: string) => {
    return formatGhanaDateTime(dateStr);
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await registrationApi.adminBulkUpdate(ids, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_registrations'] });
      queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
      setBulkSelected(new Set());
      setToastMessage('Selected registrations updated');
      setShowToast(true);
    },
    onError: (err: any) => {
      setToastMessage(err.message || 'Bulk update failed');
      setShowToast(true);
    },
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_registrations'] });
  };

  return (
    <AdminLayout onRefresh={handleRefresh}>
      <div className="registrations-page">
        <motion.div
          className="page-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="page-header-left">
            <IonIcon icon={documentTextOutline} className="page-header-icon" />
            <h1>Registrations</h1>
          </div>
          <span className="page-header-count">{registrations.length} total</span>
        </motion.div>

        <div className="filter-bar">
          <div className="filter-bar-top">
            <div className="search-wrapper">
              <IonIcon icon={searchOutline} className="search-icon" />
              <input
                type="text"
                placeholder="Search by ID, name or phone..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="search-input"
              />
            </div>
            <button className="export-btn" onClick={() => {
              const headers = 'Reg Number,Customer Name,Phone,Email,Network,SIM Number,Status,Date\n';
              const rows = filteredRegs.map((r: any) =>
                `${r.reg_number || r.id?.slice(0, 6)},"${r.full_name || ''}","${r.phone || ''}","${r.email || ''}",${r.network || ''},${r.sim_number || ''},${r.status || ''},${formatGhanaDate(r.created_at)}`
              ).join('\n');
              const blob = new Blob([headers + rows], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `registrations-${getGhanaTodayISO()}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}>
              <IonIcon icon={downloadOutline} />
              <span>Export</span>
            </button>
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
                <option value="Pending">Pending</option>
                <option value="Processing">Processing</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
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
          </div>
        </div>

        <div className="regs-table-header">
          <span className="th th-check">
            <input type="checkbox" checked={bulkSelected.size === paginatedRegs.length && paginatedRegs.length > 0} onChange={toggleAll} className="bulk-check" />
          </span>
          <span className="th th-id">Reg ID</span>
          <span className="th th-customer">Customer</span>
          <span className="th th-phone">Phone</span>
          <span className="th th-network">Network</span>
          <span className="th th-date">Date</span>
          <span className="th th-status">Status</span>
          <span className="th th-action">Action</span>
        </div>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <IonIcon icon={documentTextOutline} className="empty-icon" />
              <h3>Loading registrations...</h3>
            </motion.div>
          ) : isError ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <IonIcon icon={documentTextOutline} className="empty-icon" />
              <h3>Failed to load registrations</h3>
              <p>Please try again.</p>
              <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
            </motion.div>
          ) : paginatedRegs.length === 0 ? (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <IonIcon icon={documentTextOutline} className="empty-icon" />
              <h3>No registrations found</h3>
              <p>Try adjusting your search or filter criteria</p>
            </motion.div>
          ) : (
            <motion.div
              className="regs-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {paginatedRegs.map((reg: any, index: number) => (
                <motion.div
                  key={reg.id}
                  className="reg-card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <div className="reg-card-row">
                    <div className="reg-card-field check-field">
                      <input type="checkbox" checked={bulkSelected.has(reg.id)} onChange={() => toggleBulk(reg.id)} className="bulk-check" />
                    </div>
                    <div className="reg-card-field id-field">
                      <span className="field-label">Reg ID</span>
                      <span className="field-value id-value">{reg.reg_number || reg.id?.slice(0, 6)}</span>
                    </div>
                    <div className="reg-card-field status-field">
                      <span className="status-badge" style={{ background: statusBgColors[reg.status], color: statusColors[reg.status] }}>
                        {reg.status}
                      </span>
                    </div>
                  </div>
                  <div className="reg-card-row">
                    <div className="reg-card-field">
                      <span className="field-label">Customer</span>
                      <span className="field-value">{reg.full_name || 'Unknown'}</span>
                    </div>
                    <div className="reg-card-field">
                      <span className="field-label">Phone</span>
                      <span className="field-value">{reg.phone || ''}</span>
                    </div>
                  </div>
                  <div className="reg-card-row">
                    <div className="reg-card-field">
                      <span className="field-label">Network</span>
                      <span className="network-badge" style={{ background: networkBgColors[reg.network] || '#f5f5f5', color: networkColors[reg.network] || '#333' }}>
                        {reg.network || 'N/A'}
                      </span>
                    </div>
                    <div className="reg-card-field">
                      <span className="field-label">Date</span>
                      <span className="field-value">{formatDate(reg.created_at)}</span>
                    </div>
                  </div>
                  <div className="reg-card-row">
                    <div className="reg-card-field action-field">
                      <button className="view-btn" onClick={() => openDetail(reg)}>
                        <IonIcon icon={eyeOutline} />
                        <span>View</span>
                      </button>
                    </div>
                  </div>

                  <div className="reg-table-row" onClick={() => openDetail(reg)}>
                    <span className="td td-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={bulkSelected.has(reg.id)} onChange={() => toggleBulk(reg.id)} className="bulk-check" />
                    </span>
                    <span className="td td-id">{reg.reg_number || reg.id?.slice(0, 6)}</span>
                    <span className="td td-customer">{reg.full_name || 'Unknown'}</span>
                    <span className="td td-phone">{reg.phone || ''}</span>
                    <span className="td td-network">
                      <span className="network-badge" style={{ background: networkBgColors[reg.network] || '#f5f5f5', color: networkColors[reg.network] || '#333' }}>
                        {reg.network || 'N/A'}
                      </span>
                    </span>
                    <span className="td td-date">{formatDate(reg.created_at)}</span>
                    <span className="td td-status">
                      <span className="status-badge" style={{ background: statusBgColors[reg.status], color: statusColors[reg.status] }}>
                        {reg.status}
                      </span>
                    </span>
                    <span className="td td-action">
                      <button className="view-btn-icon" onClick={(e) => { e.stopPropagation(); openDetail(reg); }}>
                        <IonIcon icon={eyeOutline} />
                      </button>
                    </span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              <IonIcon icon={chevronBack} />
              <span>Previous</span>
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
              <span>Next</span>
              <IonIcon icon={arrowForward} />
            </button>
          </div>
        )}
      </div>

      {bulkSelected.size > 0 && (
        <motion.div
          className="bulk-action-bar"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
        >
          <span className="bulk-count">{bulkSelected.size} selected</span>
          <div className="bulk-actions">
            <button className="bulk-approve-btn" onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(bulkSelected), status: 'approved' })} disabled={bulkUpdateMutation.isPending}>
              <IonIcon icon={checkmarkCircle} />
              <span>Approve Selected</span>
            </button>
            <button className="bulk-reject-btn" onClick={() => bulkUpdateMutation.mutate({ ids: Array.from(bulkSelected), status: 'rejected' })} disabled={bulkUpdateMutation.isPending}>
              <IonIcon icon={closeCircle} />
              <span>Reject Selected</span>
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedReg && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetail}
          >
            <motion.div
              className="modal-content reg-detail-modal"
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
                <h3>Registration Details</h3>
                <button className="modal-close" onClick={closeDetail}>
                  <IonIcon icon={closeCircle} />
                </button>
              </div>

              <div className="detail-body">
                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={documentTextOutline} />
                    <span>Registration Info</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Registration ID</span>
                      <span className="detail-value mono">{selectedReg.reg_number || selectedReg.id?.slice(0, 6)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Status</span>
                      <span className="status-badge" style={{ background: statusBgColors[selectedReg.status], color: statusColors[selectedReg.status] }}>
                        {selectedReg.status}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Time</span>
                      <span className="detail-value">{formatDateTime(selectedReg.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={checkmarkCircle} />
                    <span>User Profile Info</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Full Name</span>
                      <span className="detail-value">{selectedReg.profiles?.full_name || 'Not provided'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Email</span>
                      <span className="detail-value">{selectedReg.profiles?.email || 'Not provided'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">{selectedReg.profiles?.phone || 'Not provided'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Role</span>
                      <span className="detail-value">{selectedReg.profiles?.role || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={checkmarkCircle} />
                    <span>Customer Details</span>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Full Name</span>
                      <span className="detail-value">{selectedReg.full_name || 'Unknown'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">{selectedReg.phone || ''}</span>
                    </div>
                    {selectedReg.occupation && (
                      <div className="detail-item">
                        <span className="detail-label">Occupation</span>
                        <span className="detail-value">{selectedReg.occupation}</span>
                      </div>
                    )}
                    {selectedReg.date_of_birth && (
                      <div className="detail-item">
                        <span className="detail-label">Date of Birth</span>
                        <span className="detail-value">{selectedReg.date_of_birth}</span>
                      </div>
                    )}
                    {selectedReg.ghana_card_id && (
                      <div className="detail-item">
                        <span className="detail-label">Ghana Card ID</span>
                        <span className="detail-value mono">{selectedReg.ghana_card_id}</span>
                      </div>
                    )}
                    {selectedReg.address && (
                      <div className="detail-item">
                        <span className="detail-label">Address</span>
                        <span className="detail-value">{selectedReg.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={cameraOutline} />
                    <span>Documents</span>
                  </div>
                  {!selectedReg.registration_documents || selectedReg.registration_documents.length === 0 ? (
                    <p className="no-docs">No documents uploaded</p>
                  ) : (
                    <div className="docs-list">
                      {selectedReg.registration_documents.map((doc: any, i: number) => (
                        <div className="doc-item" key={i}>
                          <div className="doc-info">
                            <IonIcon icon={documentTextOutline} className="doc-icon" />
                            <span className="doc-name">{doc.type?.replace(/_/g, ' ') || `Document ${i + 1}`}</span>
                          </div>
                          <div className="doc-actions">
                            {doc.status === 'approved' ? (
                              <span className="doc-verified">
                                <IonIcon icon={checkmarkCircle} />
                                Verified
                              </span>
                            ) : (
                              <span className="doc-unverified">
                                <IonIcon icon={timeOutline} />
                                {doc.status === 'rejected' ? 'Rejected' : 'Pending'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={timeOutline} />
                    <span>Status Timeline</span>
                  </div>
                  {!selectedReg.registration_timeline || selectedReg.registration_timeline.length === 0 ? (
                    <p className="no-docs">No timeline entries</p>
                  ) : (
                    <div className="timeline">
                      {selectedReg.registration_timeline.map((entry: any, i: number) => (
                        <div className="timeline-item" key={i}>
                          <div className="timeline-dot" style={{ background: statusColors[entry.status] || '#FFCB05' }} />
                          <div className="timeline-content">
                            <div className="timeline-header">
                              <span className="timeline-status">{entry.status}</span>
                              <span className="timeline-date">{formatGhanaDateTime(entry.created_at || entry.date)}</span>
                            </div>
                            <p className="timeline-note">{entry.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={documentTextOutline} />
                    <span>Admin Notes (internal only)</span>
                  </div>
                  <textarea
                    className="admin-notes-input"
                    placeholder="Internal notes — not shown to user..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">
                    <IonIcon icon={documentTextOutline} />
                    <span>Message to User (included in notification)</span>
                  </div>
                  <textarea
                    className="admin-notes-input"
                    placeholder="Optional message sent to the user with their status update notification..."
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button className="action-btn approve-btn" disabled={statusLoading} onClick={() => updateStatus(selectedReg.id, 'approved')}>
                  <IonIcon icon={checkmarkCircle} />
                  <span>Approve</span>
                </button>
                <button className="action-btn reject-btn" disabled={statusLoading} onClick={() => updateStatus(selectedReg.id, 'rejected')}>
                  <IonIcon icon={closeCircle} />
                  <span>Reject</span>
                </button>
                <button className="action-btn process-btn" disabled={statusLoading} onClick={() => updateStatus(selectedReg.id, 'processing')}>
                  <IonIcon icon={timeOutline} />
                  <span>Processing</span>
                </button>
                <button className="action-btn request-btn" disabled={statusLoading} onClick={() => updateStatus(selectedReg.id, 'document_verification')}>
                  <IonIcon icon={cameraOutline} />
                  <span>Request Docs</span>
                </button>
              </div>

              <div className="modal-footer-actions">
                <button className="action-btn pdf-btn" onClick={() => {
                              const content = [
                                'Registration Details',
                                '------------------',
                                `Registration ID: ${selectedReg.reg_number || selectedReg.id?.slice(0, 6)}`,
                                `Customer: ${selectedReg.full_name || 'Unknown'}`,
                                `Phone: ${selectedReg.phone || ''}`,
                                `Email: ${selectedReg.email || ''}`,
                                `Network: ${selectedReg.network || 'N/A'}`,
                                `Status: ${selectedReg.status}`,
                                `Date: ${formatDate(selectedReg.created_at)}`,
                              ].join('\n');
                              const blob = new Blob([content], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `registration-${selectedReg.reg_number || selectedReg.id?.slice(0, 6)}.txt`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              setToastMessage('Registration details downloaded');
                              setShowToast(true);
                            }}>
                  <IonIcon icon={downloadOutline} />
                  <span>Generate PDF</span>
                </button>
                <button className="action-btn print-btn" onClick={() => window.print()}>
                  <IonIcon icon={printOutline} />
                  <span>Print</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={3000} position="top" color="success" />
    </AdminLayout>
  );
};

export default RegistrationsPage;
