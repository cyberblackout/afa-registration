import React, { useState, useCallback } from 'react';
import {
  IonPage,
  IonToast,
} from '@ionic/react';
import {
  Gift, Users, CheckCircle, Clock, XCircle,
  Wallet, Copy, Share2, Link as LinkIcon, TrendingUp,
  UserPlus, DollarSign, ArrowRight, ShieldAlert,
  AlertTriangle, ShieldCheck, Ban, Smartphone,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { referralApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import Card from '../components/Card';
import AmountDisplay from '../components/AmountDisplay';
import './ReferralPage.css';

const timeAgo = (dateStr: string) => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getInitials = (name: string) => {
  if (!name || name === 'Pending') return '??';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

const INITIAL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#22c55e', '#06b6d4', '#3b82f6',
];
const getInitialColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length];
};

const ReferralPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState({ show: false, msg: '' });
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showSecurityTips, setShowSecurityTips] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => referralApi.getProfile() as Promise<any>,
    enabled: !!user?.id,
  });

  const referralCode = profile?.referral_code || '';
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['referral_stats', user?.id],
    queryFn: () => referralApi.getStats() as Promise<any>,
    enabled: !!user?.id,
  });

  const { data: referrals = [] as any[], isLoading: referralsLoading } = useQuery({
    queryKey: ['my_referrals', user?.id],
    queryFn: () => referralApi.getMyReferrals() as Promise<any[]>,
    enabled: !!user?.id,
  });

  const { data: rewards = [] as any[], isLoading: rewardsLoading } = useQuery({
    queryKey: ['referral_rewards', user?.id],
    queryFn: () => referralApi.getMyRewards() as Promise<any[]>,
    enabled: !!user?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['referral_stats', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['my_referrals', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['referral_rewards', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['referral-reward-transactions', user?.id] });
  };

  const pendingRewards = rewards
    .filter((r: any) => r.status === 'pending')
    .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

  const { data: transactions = [], isLoading: txnsLoading } = useQuery({
    queryKey: ['referral-reward-transactions', user?.id],
    queryFn: () => referralApi.getMyReferralTransactions() as Promise<any[]>,
    enabled: !!user?.id,
  });

  const referralTransactions = transactions.filter((t: any) => t.reference?.startsWith('REF-'));

  const isLoadingAll = profileLoading || statsLoading || referralsLoading || rewardsLoading || txnsLoading;

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setToast({ show: true, msg: 'Referral code copied!' });
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setToast({ show: true, msg: 'Failed to copy' });
    }
  }, [referralCode]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setToast({ show: true, msg: 'Referral link copied!' });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setToast({ show: true, msg: 'Failed to copy' });
    }
  }, [referralLink]);

  const selfReferralCheck = useCallback(() => {
    const currentUrl = window.location.href;
    if (currentUrl.includes('ref=') && currentUrl.includes(referralCode)) {
      return true;
    }
    return false;
  }, [referralCode]);

  if (isLoadingAll) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="rr-page">
            <div className="loading-state">
              <p>Loading referrals...</p>
            </div>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

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
    return <span className={`rr-badge ${m.cls}`}>{m.label}</span>;
  };

  const statsData = stats || { total_invited: 0, successful: 0, pending: 0, rejected: 0, total_earned: 0 };

  const rejectedCount = statsData.rejected || 0;
  const hasRejectedReferrals = rejectedCount > 0;
  const fraudAlertLevel = rejectedCount >= 3 ? 'high' : rejectedCount >= 1 ? 'medium' : 'none';

  const isSelfReferral = selfReferralCheck();

  return (
    <IonPage>
    <DashboardLayout onRefresh={handleRefresh}>
      <div className="rr-page">

        {/* ===== HERO ===== */}
        <div className="rr-hero">
          <div className="rr-hero-glow" />
          <div className="rr-hero-glow rr-hero-glow--alt" />
          <div className="rr-hero-content">
            <div className="rr-hero-label">
              <Gift size={14} />
              <span>Referral Program</span>
            </div>
            <h1 className="rr-hero-title">Share the link.<br />Earn together.</h1>
            <p className="rr-hero-sub">Invite friends to MTN AFA. You both earn when they complete their first registration.</p>

            <div className="rr-hero-code">
              <span className="rr-hero-code-label">Your code</span>
              <div className="rr-hero-code-row">
                <span className="rr-hero-code-value">{referralCode || '------'}</span>
                <button className={`rr-hero-copy-btn ${copiedCode ? 'rr-hero-copy-btn--done' : ''}`} onClick={copyCode}>
                  {copiedCode ? <CheckCircle size={20} /> : <Copy size={18} />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="rr-hero-link">
              <div className="rr-hero-link-input-wrap">
                <LinkIcon size={15} className="rr-hero-link-icon" />
                <input className="rr-hero-link-input" value={referralLink} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
              </div>
              <button className={`rr-hero-link-btn ${copiedLink ? 'rr-hero-link-btn--done' : ''}`} onClick={copyLink}>
                {copiedLink ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div className="rr-hero-share">
              <button className="rr-hero-share-wa" onClick={() => shareVia('whatsapp')}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Share on WhatsApp
              </button>
              <div className="rr-hero-share-others">
                <button className="rr-hero-share-pill" onClick={() => shareVia('facebook')} title="Facebook">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                <button className="rr-hero-share-pill" onClick={() => shareVia('telegram')} title="Telegram">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </button>
                <button className="rr-hero-share-pill" onClick={() => shareVia('email')} title="Email">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                </button>
                <button className="rr-hero-share-pill" onClick={copyLink} title="Copy Link">
                  <LinkIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== FRAUD ALERT BANNER ===== */}
        {hasRejectedReferrals && (
          <div className={`rr-fraud-alert rr-fraud-alert--${fraudAlertLevel}`}>
            <div className="rr-fraud-alert-icon">
              <ShieldAlert size={20} />
            </div>
            <div className="rr-fraud-alert-content">
              <span className="rr-fraud-alert-title">
                {fraudAlertLevel === 'high' ? 'Account Under Review' : 'Referral Activity Flagged'}
              </span>
              <p className="rr-fraud-alert-desc">
                {fraudAlertLevel === 'high'
                  ? `${rejectedCount} of your referrals were rejected. Your referral privileges may be restricted. Contact support if you believe this is an error.`
                  : `${rejectedCount} referral(s) were rejected for policy violations. Repeated violations may result in account restrictions.`
                }
              </p>
            </div>
          </div>
        )}

        {/* ===== SELF-REFERRAL WARNING ===== */}
        {isSelfReferral && (
          <div className="rr-fraud-alert rr-fraud-alert--self">
            <div className="rr-fraud-alert-icon">
              <Ban size={20} />
            </div>
            <div className="rr-fraud-alert-content">
              <span className="rr-fraud-alert-title">Self-Referral Detected</span>
              <p className="rr-fraud-alert-desc">
                You cannot earn rewards by referring yourself. Share your link with others to earn legitimate rewards.
              </p>
            </div>
          </div>
        )}

        {/* ===== SECURITY TIPS TOGGLE ===== */}
        <button
          className="rr-security-toggle"
          onClick={() => setShowSecurityTips(!showSecurityTips)}
        >
          <ShieldCheck size={16} />
          <span>{showSecurityTips ? 'Hide' : 'Show'} Referral Guidelines</span>
          <AlertTriangle size={14} className={`rr-security-toggle-arrow ${showSecurityTips ? 'open' : ''}`} />
        </button>

        {showSecurityTips && (
          <Card variant="bordered" className="rr-security-tips">
            <div className="rr-security-tip">
              <Smartphone size={16} className="rr-security-tip-icon" />
              <div>
                <strong>One account per person</strong>
                <p>Each person can only register one account. Duplicate accounts from the same device or IP will be flagged and rejected.</p>
              </div>
            </div>
            <div className="rr-security-tip">
              <Users size={16} className="rr-security-tip-icon" />
              <div>
                <strong>Refer real people only</strong>
                <p>Referring fake accounts, bots, or using automated methods is prohibited and will result in permanent referral restrictions.</p>
              </div>
            </div>
            <div className="rr-security-tip">
              <ShieldCheck size={16} className="rr-security-tip-icon" />
              <div>
                <strong>Rewards require verification</strong>
                <p>Referral rewards are only granted after the referred user completes a valid registration and purchase. Fraudulent referrals are rejected.</p>
              </div>
            </div>
            <div className="rr-security-tip">
              <Ban size={16} className="rr-security-tip-icon" />
              <div>
                <strong>No self-referrals</strong>
                <p>Creating multiple accounts to refer yourself is strictly prohibited and may lead to account suspension.</p>
              </div>
            </div>
          </Card>
        )}

        {/* ===== EARNINGS REWARD ===== */}
        <Card className="rr-earnings">
          <div className="rr-earnings-main">
            <div className="rr-earnings-icon-wrap">
              <TrendingUp size={22} />
            </div>
            <div className="rr-earnings-data">
              <span className="rr-earnings-label">Total Earned</span>
              <span className="rr-earnings-amount"><AmountDisplay value={statsData.total_earned} showToggle={false} /></span>
            </div>
          </div>
          <div className="rr-earnings-secondary">
            <div className="rr-earnings-secondary-item">
              <Clock size={14} />
              <span className="rr-earnings-secondary-label">Pending</span>
              <span className="rr-earnings-secondary-value rr-earnings-pending"><AmountDisplay value={pendingRewards} showToggle={false} /></span>
            </div>
            <div className="rr-earnings-divider-v" />
            <div className="rr-earnings-secondary-item">
              <Wallet size={14} />
              <span className="rr-earnings-secondary-label">Available</span>
              <span className="rr-earnings-secondary-value"><AmountDisplay value={user?.wallet_balance || 0} showToggle={false} /></span>
            </div>
          </div>
        </Card>

        {/* ===== STATS ===== */}
        <div className="rr-stats">
          {[
            { icon: Users, label: 'Invited', value: statsData.total_invited, color: '#6366f1' },
            { icon: CheckCircle, label: 'Successful', value: statsData.successful, color: '#22c55e' },
            { icon: Clock, label: 'Pending', value: statsData.pending, color: '#f59e0b' },
            ...(rejectedCount > 0 ? [{ icon: XCircle, label: 'Rejected', value: rejectedCount, color: '#ef4444' }] : []),
          ].map((s) => {
            const IconEl = s.icon;
            return (
              <Card key={s.label} className="rr-stat">
                <div className="rr-stat-head">
                  <div className="rr-stat-icon" style={{ color: s.color }}>
                    <IconEl size={18} />
                  </div>
                  <span className="rr-stat-label">{s.label}</span>
                </div>
                <span className="rr-stat-value">{s.value}</span>
              </Card>
            );
          })}
        </div>

        {/* ===== HOW IT WORKS — compact strip ===== */}
        <Card variant="bordered" className="rr-how">
          <div className="rr-how-step">
            <div className="rr-how-num">1</div>
            <span>Share your link</span>
          </div>
          <ArrowRight size={16} className="rr-how-arrow" />
          <div className="rr-how-step">
            <div className="rr-how-num">2</div>
            <span>Friend registers</span>
          </div>
          <ArrowRight size={16} className="rr-how-arrow" />
          <div className="rr-how-step">
            <div className="rr-how-num">3</div>
            <span>You both earn</span>
          </div>
        </Card>

        {/* ===== REFERRAL HISTORY ===== */}
        {referrals.length > 0 && (
          <div className="rr-section">
            <div className="rr-section-head">
              <h2>Referral History</h2>
              <span className="rr-section-count">{referrals.length}</span>
            </div>
            <Card noPadding variant="bordered" className="rr-feed">
              {referrals.map((r: any) => {
                const name = r.referred_profile?.full_name || r.referred_id?.slice(0, 8) || 'Pending';
                const color = getInitialColor(name);
                return (
                  <div key={r.id} className="rr-feed-item">
                    <div className="rr-feed-avatar" style={{ background: color }}>
                      {getInitials(name)}
                    </div>
                    <div className="rr-feed-body">
                      <div className="rr-feed-top">
                        <span className="rr-feed-name">{name}</span>
                        {statusBadge(r.status)}
                      </div>
                      <div className="rr-feed-meta">
                        <span>{timeAgo(r.created_at)}</span>
                        <span className="rr-feed-amount"><AmountDisplay value={r.reward_amount || 0} showToggle={false} /></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {referrals.length === 0 && (
          <Card variant="bordered" className="rr-empty-state">
            <div className="rr-empty-icon"><Users size={32} /></div>
            <p className="rr-empty-title">No referrals yet</p>
            <p className="rr-empty-sub">Share your link above to start earning rewards.</p>
          </Card>
        )}

        {/* ===== REWARD TRANSACTIONS ===== */}
        {referralTransactions.length > 0 && (
          <div className="rr-section">
            <div className="rr-section-head">
              <h2>Reward Transactions</h2>
            </div>
            <Card noPadding variant="bordered" className="rr-table-card">
              <div className="rr-table-wrap">
                <div className="rr-table">
                  <div className="rr-table-header">
                    <span>Description</span>
                    <span>Amount</span>
                    <span>Date</span>
                    <span>Reference</span>
                  </div>
                  {referralTransactions.map((t: any) => (
                    <div key={t.id} className="rr-table-row">
                      <span className="rr-table-desc">{t.description}</span>
                      <span className="rr-table-amount rr-table-credit"><AmountDisplay value={t.amount} showToggle={false} /></span>
                      <span className="rr-table-date">{timeAgo(t.created_at)}</span>
                      <span className="rr-table-ref">{t.reference || '---'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rr-mobile-list">
                {referralTransactions.map((t: any) => (
                  <div key={t.id} className="rr-mobile-card">
                    <div className="rr-mobile-card-top">
                      <span className="rr-mobile-card-desc">{t.description}</span>
                      <span className="rr-mobile-card-amount rr-table-credit"><AmountDisplay value={t.amount} showToggle={false} /></span>
                    </div>
                    <div className="rr-mobile-card-bottom">
                      <span className="rr-mobile-card-date">{timeAgo(t.created_at)}</span>
                      <span className="rr-mobile-card-ref">{t.reference || '---'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <IonToast isOpen={toast.show} onDidDismiss={() => setToast({ show: false, msg: '' })} message={toast.msg} duration={2000} position="bottom" />
      </div>
    </DashboardLayout>
    </IonPage>
  );
};

export default ReferralPage;
