import React, { useState } from 'react';
import { IonContent, IonIcon, IonToast, IonButton } from '@ionic/react';
import {
  peopleOutline, checkmarkCircle, timeOutline, closeCircle,
  cashOutline, trendingUpOutline, refreshOutline,
  searchOutline, funnelOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import './ReferralManagementPage.css';

const ReferralManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState({ show: false, msg: '' });

  const { data: analytics } = useQuery({
    queryKey: ['admin_referral_analytics'],
    queryFn: () => referralApi.adminAnalytics() as any,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['admin_all_referrals'],
    queryFn: () => referralApi.adminList() as any,
  });

  const updateStatus = async (id: string, status: string) => {
    await referralApi.adminUpdateStatus(id, status);
    queryClient.invalidateQueries({ queryKey: ['admin_all_referrals'] });
    queryClient.invalidateQueries({ queryKey: ['admin_referral_analytics'] });
    setToast({ show: true, msg: `Referral ${status}` });
  };

  const analyticsData = analytics || {
    total_referrals: 0, successful: 0, pending: 0, rejected: 0,
    total_rewards_paid: 0, unique_referrers: 0, fraud_attempts: 0,
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'badge-pending', registered: 'badge-info',
      purchase_completed: 'badge-info', reward_granted: 'badge-success',
      rejected: 'badge-danger',
    };
    const labels: Record<string, string> = {
      pending: 'Pending', registered: 'Registered',
      purchase_completed: 'Purchase Done', reward_granted: 'Rewarded',
      rejected: 'Rejected',
    };
    return <span className={`admin-status-badge ${map[s] || ''}`}>{labels[s] || s}</span>;
  };

  return (
    <AdminLayout>
      <div className="admin-referral-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={peopleOutline} className="page-icon" />
            <h1>Referral Management</h1>
          </div>
        </motion.div>

        <div className="analytics-grid">
          {[
            { icon: peopleOutline, label: 'Total Referrals', value: analyticsData.total_referrals, color: '#6366f1' },
            { icon: checkmarkCircle, label: 'Successful', value: analyticsData.successful, color: '#059669' },
            { icon: timeOutline, label: 'Pending', value: analyticsData.pending, color: '#f59e0b' },
            { icon: closeCircle, label: 'Rejected', value: analyticsData.rejected, color: '#dc2626' },
            { icon: cashOutline, label: 'Rewards Paid', value: `GH₵ ${Number(analyticsData.total_rewards_paid ?? 0).toFixed(2)}`, color: '#059669' },
            { icon: trendingUpOutline, label: 'Unique Referrers', value: analyticsData.unique_referrers, color: '#6366f1' },
          ].map((s, i) => (
            <motion.div key={s.label} className="analytics-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <div className="analytics-icon" style={{ background: `${s.color}15`, color: s.color }}><IonIcon icon={s.icon} /></div>
              <div className="analytics-value">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
              <div className="analytics-label">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {analyticsData.fraud_attempts > 0 && (
          <div className="fraud-alert">
            <IonIcon icon={closeCircle} />
            <span>{analyticsData.fraud_attempts} fraud attempt(s) detected</span>
          </div>
        )}

        <div className="referrals-table-card">
          <div className="table-header">
            <h3>All Referrals</h3>
            <IonButton fill="clear" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin_all_referrals'] })}>
              <IonIcon icon={refreshOutline} slot="start" /> Refresh
            </IonButton>
          </div>
          {referrals.length === 0 ? (
            <div className="empty-state">
              <IonIcon icon={peopleOutline} />
              <p>No referrals yet.</p>
            </div>
          ) : (
            <div className="ref-table">
              <div className="ref-th">
                <span>Referrer</span>
                <span>Referred</span>
                <span>Code</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Date</span>
                <span>Actions</span>
              </div>
              {referrals.map((r: any, i: number) => (
                <motion.div key={r.id} className="ref-tr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                  <span className="ref-name">{r.referrer?.full_name || 'Unknown'}</span>
                  <span className="ref-name">{r.referred?.full_name || '---'}</span>
                  <span className="ref-code">{r.referral_code}</span>
                  <span className="ref-amount">GH₵ {Number(r.reward_amount || 0).toFixed(2)}</span>
                  <span>{statusBadge(r.status)}</span>
                  <span className="ref-date">{formatGhanaDate(r.created_at)}</span>
                  <span className="ref-actions">
                    {r.status !== 'reward_granted' && r.status !== 'rejected' && (
                      <>
                        <button className="action-btn action-approve" onClick={() => updateStatus(r.id, 'reward_granted')}>Approve</button>
                        <button className="action-btn action-reject" onClick={() => updateStatus(r.id, 'rejected')}>Reject</button>
                      </>
                    )}
                    {r.status === 'reward_granted' && <span className="rewarded-label">Paid</span>}
                    {r.status === 'rejected' && <span className="rewarded-label rejected">Rejected</span>}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
      <IonToast isOpen={toast.show} onDidDismiss={() => setToast({ show: false, msg: '' })} message={toast.msg} duration={2000} position="top" color="success" />
    </AdminLayout>
  );
};

export default ReferralManagementPage;
