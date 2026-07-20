import React, { useState, useCallback } from 'react';
import {
  IonPage, IonIcon, IonToast,
} from '@ionic/react';
import {
  shareOutline, linkOutline, logoWhatsapp, logoFacebook, paperPlaneOutline,
  mailOutline, peopleOutline, checkmarkCircle, timeOutline, closeCircle,
  walletOutline, copyOutline, trendingUpOutline, giftOutline,
  arrowForwardOutline, cashOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import './ReferralPage.css';

const ReferralPage: React.FC = () => {
  const { user } = useAuthStore();
  const [toast, setToast] = useState({ show: false, msg: '' });

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
      if (data && !data.referral_code) {
        await supabase.rpc('generate_referral_code');
        const { data: updated } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
        return updated;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const referralCode = profile?.referral_code || '';
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const { data: stats } = useQuery({
    queryKey: ['referral_stats', user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_referral_stats');
      return data as any;
    },
    enabled: !!user?.id,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['my_referrals', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('referrals')
        .select('*, referred_profile:profiles!referred_id(full_name, email, phone)')
        .eq('referrer_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: rewards = [] } = useQuery({
    queryKey: ['referral_rewards', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('referral_rewards')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['wallet-transactions', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('type', 'credit')
        .contains('description', 'Referral')
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setToast({ show: true, msg: 'Referral link copied!' });
    } catch {
      setToast({ show: true, msg: 'Failed to copy link' });
    }
  }, [referralLink]);

  const shareVia = (platform: string) => {
    const text = `Join MTN AFA using my referral link and earn rewards! ${referralLink}`;
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
      facebook: `https://facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}&u=${encodeURIComponent(referralLink)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`,
      email: `mailto:?subject=Join MTN AFA&body=${encodeURIComponent(text)}`,
    };
    if (platform === 'copy') { copyLink(); return; }
    const url = urls[platform];
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: 'Pending', cls: 'badge-pending' },
      registered: { label: 'Registered', cls: 'badge-info' },
      purchase_completed: { label: 'Purchase Done', cls: 'badge-info' },
      reward_granted: { label: 'Rewarded', cls: 'badge-success' },
      rejected: { label: 'Rejected', cls: 'badge-danger' },
    };
    const m = map[s] || { label: s, cls: 'badge-pending' };
    return <span className={`status-badge ${m.cls}`}>{m.label}</span>;
  };

  const txnAmount = transactions.reduce((sum, t: any) => sum + Number(t.amount), 0);
  const statsData = stats || { total_invited: 0, successful: 0, pending: 0, rejected: 0, total_earned: 0 };

  return (
    <IonPage>
      <DashboardLayout>
        <motion.div className="referral-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="page-header">
              <h1>Referral & Rewards</h1>
              <p>Invite friends, earn rewards on every successful referral</p>
            </div>

            <div className="referral-profile-card">
              <div className="referral-profile-top">
                <div className="rp-icon"><IonIcon icon={giftOutline} /></div>
                <div className="rp-info">
                  <h3>Your Referral Profile</h3>
                  <p>Share your unique code and earn 1 GHC per referral</p>
                </div>
              </div>
              <div className="ref-code-section">
                <div className="ref-code-display">
                  <span className="ref-code-label">Referral Code</span>
                  <span className="ref-code-value">{referralCode || '---'}</span>
                </div>
                <div className="ref-link-display">
                  <span className="ref-code-label">Referral Link</span>
                  <div className="ref-link-row">
                    <input className="ref-link-input" value={referralLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <button className="ref-copy-btn" onClick={copyLink}><IonIcon icon={copyOutline} /></button>
                  </div>
                </div>
              </div>
              <div className="share-section">
                <span className="share-label">Share via</span>
                <div className="share-buttons">
                  {[
                    { icon: logoWhatsapp, key: 'whatsapp', label: 'WhatsApp' },
                    { icon: logoFacebook, key: 'facebook', label: 'Facebook' },
                    { icon: paperPlaneOutline, key: 'telegram', label: 'Telegram' },
                    { icon: mailOutline, key: 'email', label: 'Email' },
                    { icon: linkOutline, key: 'copy', label: 'Copy' },
                  ].map((s) => (
                    <button key={s.key} className="share-btn" onClick={() => shareVia(s.key)}>
                      <IonIcon icon={s.icon} />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="stats-grid">
              {[
                { icon: peopleOutline, label: 'Total Invited', value: statsData.total_invited, color: '#6366f1' },
                { icon: checkmarkCircle, label: 'Successful', value: statsData.successful, color: '#059669' },
                { icon: timeOutline, label: 'Pending', value: statsData.pending, color: '#f59e0b' },
                { icon: closeCircle, label: 'Rejected', value: statsData.rejected, color: '#dc2626' },
                { icon: cashOutline, label: 'Total Earned', value: `GH₵ ${Number(statsData.total_earned).toFixed(2)}`, color: '#059669' },
              ].map((s, i) => (
                <motion.div key={s.label} className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <div className="stat-icon" style={{ background: `${s.color}15`, color: s.color }}><IonIcon icon={s.icon} /></div>
                  <div className="stat-info">
                    <span className="stat-value">{typeof s.value === 'number' ? s.value : s.value}</span>
                    <span className="stat-label">{s.label}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="referral-history-card">
              <div className="card-header">
                <IonIcon icon={trendingUpOutline} />
                <h3>Referral History</h3>
              </div>
              {referrals.length === 0 ? (
                <div className="empty-state">
                  <IonIcon icon={peopleOutline} />
                  <p>No referrals yet. Share your link to start earning!</p>
                </div>
              ) : (
                <div className="referral-table">
                  <div className="rt-header">
                    <span>Customer</span>
                    <span>Date</span>
                    <span>Status</span>
                    <span>Reward</span>
                  </div>
                  {referrals.map((r: any, i: number) => (
                    <motion.div key={r.id} className="rt-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <span className="rt-customer">{r.referred_profile?.full_name || r.referred_id?.slice(0, 8) || 'Pending'}</span>
                      <span className="rt-date">{new Date(r.created_at).toLocaleDateString()}</span>
                      <span>{statusBadge(r.status)}</span>
                      <span className="rt-amount">GH₵ {Number(r.reward_amount || 0).toFixed(2)}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="referral-history-card">
              <div className="card-header">
                <IonIcon icon={walletOutline} />
                <h3>Reward Transactions</h3>
              </div>
              {transactions.length === 0 ? (
                <div className="empty-state">
                  <IonIcon icon={walletOutline} />
                  <p>No reward transactions yet.</p>
                </div>
              ) : (
                <div className="referral-table">
                  <div className="rt-header">
                    <span>Description</span>
                    <span>Amount</span>
                    <span>Date</span>
                    <span>Reference</span>
                  </div>
                  {transactions.map((t: any, i: number) => (
                    <motion.div key={t.id} className="rt-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                      <span className="rt-customer">{t.description}</span>
                      <span className="rt-amount" style={{ color: '#059669' }}>+GH₵ {Number(t.amount).toFixed(2)}</span>
                      <span className="rt-date">{new Date(t.created_at).toLocaleDateString()}</span>
                      <span className="rt-date">{t.reference || '---'}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
        </motion.div>
        <IonToast isOpen={toast.show} onDidDismiss={() => setToast({ show: false, msg: '' })} message={toast.msg} duration={2000} position="bottom" />
      </DashboardLayout>
    </IonPage>
  );
};

export default ReferralPage;
