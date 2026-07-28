import React, { useState, useCallback } from 'react';
import {
  IonPage,
  IonToast,
} from '@ionic/react';
import {
  Gift, Users, CheckCircle, Clock, XCircle,
  Wallet, Copy, Share2, Link, TrendingUp,
  Crown, UserPlus, LogIn, DollarSign,
  Star, ShieldCheck, Phone, Zap, Network,
  ChevronRight,
} from 'lucide-react';
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

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setToast({ show: true, msg: 'Referral code copied!' });
    } catch {
      setToast({ show: true, msg: 'Failed to copy code' });
    }
  }, [referralCode]);

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
    return <span className={`rr-status-badge ${m.cls}`}>{m.label}</span>;
  };

  const txnAmount = transactions.reduce((sum, t: any) => sum + Number(t.amount), 0);
  const statsData = stats || { total_invited: 0, successful: 0, pending: 0, rejected: 0, total_earned: 0 };

  const steps = [
    { icon: Share2, title: 'Share Your Link', desc: 'Send your referral link to friends.' },
    { icon: UserPlus, title: 'Friend Registers', desc: 'They create an account using your referral.' },
    { icon: DollarSign, title: 'Earn Rewards', desc: 'You receive rewards after successful completion.' },
  ];

  const trustItems = [
    { icon: ShieldCheck, label: 'Secure Platform' },
    { icon: Phone, label: '24/7 Support' },
    { icon: Zap, label: 'Fast Processing' },
    { icon: Network, label: 'Trusted Network' },
  ];

  return (
    <IonPage>
    <DashboardLayout>
      <div className="rr-page">

        {/* ===== HEADER ===== */}
        <div className="rr-header">
          <div className="rr-header-badge">
            <Gift size={14} />
            <span>Earn rewards together</span>
          </div>
          <h1>Referral & Rewards</h1>
          <p>Invite friends, grow your network, and earn rewards for every successful referral.</p>
        </div>

        {/* ===== REFERRAL PROFILE CARD ===== */}
        <div className="rr-profile-card">
          <div className="rr-profile-top">
            <div className="rr-profile-icon">
              <Gift size={24} />
            </div>
            <div className="rr-profile-info">
              <h3>Your Referral Profile</h3>
              <p>Share your referral code and earn rewards when new users join through your link.</p>
            </div>
          </div>

          <div className="rr-code-section">
            <div className="rr-code-card">
              <div className="rr-code-label">Referral Code</div>
              <div className="rr-code-row">
                <span className="rr-code-value">{referralCode || '---'}</span>
                <button className="rr-code-copy" onClick={copyCode}>
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <div className="rr-link-section">
              <div className="rr-code-label">Referral Link</div>
              <div className="rr-link-row">
                <div className="rr-link-input-wrap">
                  <Link size={16} className="rr-link-icon" />
                  <input className="rr-link-input" value={referralLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
                </div>
                <button className="rr-link-copy" onClick={copyLink} title="Copy link">
                  <Copy size={16} />
                </button>
                <button className="rr-link-share" onClick={() => shareVia('whatsapp')} title="Share via WhatsApp">
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="rr-share-section">
            <span className="rr-share-label">Share via</span>
            <div className="rr-share-buttons">
              <button className="rr-share-btn rr-share-wa" onClick={() => shareVia('whatsapp')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                <span>WhatsApp</span>
              </button>
              <button className="rr-share-btn rr-share-fb" onClick={() => shareVia('facebook')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span>Facebook</span>
              </button>
              <button className="rr-share-btn rr-share-tg" onClick={() => shareVia('telegram')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                <span>Telegram</span>
              </button>
              <button className="rr-share-btn rr-share-em" onClick={() => shareVia('email')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                <span>Email</span>
              </button>
              <button className="rr-share-btn rr-share-copy" onClick={() => shareVia('copy')}>
                <Link size={18} />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        </div>

        {/* ===== STATISTICS ===== */}
        <div className="rr-stats-grid">
          {[
            { icon: Users, label: 'Total Invited', value: statsData.total_invited, color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
            { icon: CheckCircle, label: 'Successful', value: statsData.successful, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
            { icon: Clock, label: 'Pending', value: statsData.pending, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
            { icon: XCircle, label: 'Rejected', value: statsData.rejected, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
          ].map((s) => {
            const IconEl = s.icon;
            return (
              <div key={s.label} className="rr-stat-card">
                <div className="rr-stat-icon" style={{ background: s.bg, color: s.color }}>
                  <IconEl size={20} />
                </div>
                <div className="rr-stat-info">
                  <span className="rr-stat-value">{s.value}</span>
                  <span className="rr-stat-label">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== REWARD EARNINGS ===== */}
        <div className="rr-section">
          <div className="rr-section-header">
            <h2>Your Referral Earnings</h2>
          </div>
          <div className="rr-earnings-card">
            <div className="rr-earnings-grid">
              <div className="rr-earnings-item">
                <div className="rr-earnings-icon">
                  <Wallet size={20} />
                </div>
                <span className="rr-earnings-label">Total Rewards Earned</span>
                <span className="rr-earnings-value">GHS {Number(statsData.total_earned).toFixed(2)}</span>
              </div>
              <div className="rr-earnings-divider" />
              <div className="rr-earnings-item">
                <div className="rr-earnings-icon">
                  <Clock size={20} />
                </div>
                <span className="rr-earnings-label">Pending Rewards</span>
                <span className="rr-earnings-value rr-earnings-pending">GHS 0.00</span>
              </div>
              <div className="rr-earnings-divider" />
              <div className="rr-earnings-item">
                <div className="rr-earnings-icon">
                  <TrendingUp size={20} />
                </div>
                <span className="rr-earnings-label">Available Balance</span>
                <span className="rr-earnings-value rr-earnings-available">GHS {Number(user?.wallet_balance || 0).toFixed(2)}</span>
              </div>
            </div>
            <p className="rr-earnings-note">Keep inviting users to increase your rewards.</p>
          </div>
        </div>

        {/* ===== HOW IT WORKS ===== */}
        <div className="rr-section">
          <div className="rr-section-header">
            <h2>How It Works</h2>
          </div>
          <div className="rr-steps">
            {steps.map((s, i) => {
              const IconEl = s.icon;
              return (
                <div key={s.title} className="rr-step">
                  <div className="rr-step-num">{i + 1}</div>
                  <div className="rr-step-icon">
                    <IconEl size={24} />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  {i < steps.length - 1 && <div className="rr-step-arrow"><ChevronRight size={20} /></div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== REFERRAL HISTORY ===== */}
        <div className="rr-section">
          <div className="rr-section-header">
            <h2>Referral History</h2>
          </div>
          <div className="rr-table-card">
            {referrals.length === 0 ? (
              <div className="rr-empty">
                <Users size={40} />
                <p>No referrals yet. Share your link to start earning!</p>
              </div>
            ) : (
              <div className="rr-table-wrap">
                <div className="rr-table">
                  <div className="rr-table-header">
                    <span>Customer</span>
                    <span>Date</span>
                    <span>Status</span>
                    <span>Reward</span>
                  </div>
                  {referrals.map((r: any) => (
                    <div key={r.id} className="rr-table-row">
                      <span className="rr-table-customer">{r.referred_profile?.full_name || r.referred_id?.slice(0, 8) || 'Pending'}</span>
                      <span className="rr-table-date">{new Date(r.created_at).toLocaleDateString()}</span>
                      <span>{statusBadge(r.status)}</span>
                      <span className="rr-table-amount">GHS {Number(r.reward_amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== REWARD TRANSACTIONS ===== */}
        <div className="rr-section">
          <div className="rr-section-header">
            <h2>Reward Transactions</h2>
          </div>
          <div className="rr-table-card">
            {transactions.length === 0 ? (
              <div className="rr-empty">
                <Wallet size={40} />
                <p>No reward transactions yet.</p>
              </div>
            ) : (
              <div className="rr-table-wrap">
                <div className="rr-table">
                  <div className="rr-table-header">
                    <span>Description</span>
                    <span>Amount</span>
                    <span>Date</span>
                    <span>Reference</span>
                  </div>
                  {transactions.map((t: any) => (
                    <div key={t.id} className="rr-table-row">
                      <span className="rr-table-customer">{t.description}</span>
                      <span className="rr-table-amount rr-table-credit">+GHS {Number(t.amount).toFixed(2)}</span>
                      <span className="rr-table-date">{new Date(t.created_at).toLocaleDateString()}</span>
                      <span className="rr-table-date">{t.reference || '---'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== TRUST FOOTER ===== */}
        <div className="rr-trust-footer">
          {trustItems.map((t) => {
            const IconEl = t.icon;
            return (
              <div key={t.label} className="rr-trust-item">
                <IconEl size={16} />
                <span>{t.label}</span>
              </div>
            );
          })}
        </div>

        <IonToast isOpen={toast.show} onDidDismiss={() => setToast({ show: false, msg: '' })} message={toast.msg} duration={2000} position="bottom" />
      </div>
    </DashboardLayout>
    </IonPage>
  );
};

export default ReferralPage;
