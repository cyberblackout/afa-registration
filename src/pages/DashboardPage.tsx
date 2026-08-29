import React from 'react';
import { IonPage, IonIcon } from '@ionic/react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { profileApi, orderApi, referralApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import AmountDisplay from '../components/AmountDisplay';
import DashboardLayout from '../layouts/DashboardLayout';
import {
  walletOutline,
  cartOutline,
  documentTextOutline,
  addCircleOutline,
  personOutline,
  giftOutline,
  notificationsOutline,
  arrowForward,
  chevronForward,
  timeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import './DashboardPage.css';

const quickActions = [
  { icon: addCircleOutline, title: 'Register AFA', subtitle: 'New order', path: '/register-afa', color: '#FFCB05' },
  { icon: walletOutline, title: 'Wallet', subtitle: 'Top up', path: '/wallet', color: '#10b981' },
  { icon: cartOutline, title: 'Orders', subtitle: 'Track', path: '/orders', color: '#3b82f6' },
  { icon: personOutline, title: 'Profile', subtitle: 'Account', path: '/profile', color: '#8b5cf6' },
  { icon: giftOutline, title: 'Referral', subtitle: 'Earn', path: '/referrals', color: '#f59e0b' },
  { icon: notificationsOutline, title: 'Notifications', subtitle: 'Alerts', path: '/notifications', color: '#ef4444' },
];

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['orders-count', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['registrations-count', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['referral_stats_dash', user?.id] });
  };

  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => profileApi.get(user!.id),
    enabled: !!user?.id,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-count', user?.id],
    queryFn: async () => {
      const data = await orderApi.list(user!.id);
      return (Array.isArray(data) ? data : []).slice(0, 5);
    },
    enabled: !!user?.id,
  });

  const { data: regCount, isLoading: regLoading } = useQuery({
    queryKey: ['registrations-count', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('registrations')
        .select('id', { count: 'exact' })
        .eq('user_id', user!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  const balance = Number((profile as any)?.wallet_balance ?? 0);
  const orders = ordersData ?? [];
  const recentOrdersCount = orders.length;

  const { data: referralStats, isLoading: referralLoading } = useQuery({
    queryKey: ['referral_stats_dash', user?.id],
    queryFn: () => referralApi.getStats(),
    enabled: !!user?.id,
  });

  const isLoadingAll = profileLoading || ordersLoading || regLoading || referralLoading;

  const displayName = profile?.full_name || user?.full_name || 'User';
  const firstName = displayName.split(' ')[0];
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const isAgent = (profile as any)?.role === 'agent' || user?.role === 'agent';

  if (isLoadingAll) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="db-page">
            <div className="db-skeleton">
              <div className="db-skeleton-line db-skeleton-line--lg" />
              <div className="db-skeleton-card" />
              <div className="db-skeleton-row">
                <div className="db-skeleton-card" />
                <div className="db-skeleton-card" />
              </div>
            </div>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

  if (profileError) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="db-page">
            <div className="db-error">
              <p>Failed to load dashboard.</p>
              <button onClick={handleRefresh}>Retry</button>
            </div>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <div className="db-page">

          {/* ── WALLET CARD ── */}
          <div className="db-wallet-card">
            <div className="db-wallet-greeting">
              <h1>Welcome back, {capitalizedName} <span className="db-wave">👋</span></h1>
              <p>Your MTN AFA Portal is ready to serve you.</p>
              {isAgent && (
                <span className="db-role-badge">
                  <IonIcon icon={personOutline} />
                  Agent
                </span>
              )}
            </div>
            <div className="db-wallet-top">
              <div className="db-wallet-label">
                <IonIcon icon={walletOutline} />
                <span>Wallet Balance</span>
              </div>
              <a href="/wallet" className="db-wallet-history-btn">
                <IonIcon icon={timeOutline} />
                History
              </a>
            </div>
            <div className="db-wallet-balance">
              <AmountDisplay value={balance} className="amount-display--dark db-wallet-amount-display" />
            </div>
            <a href="/wallet" className="db-wallet-topup-btn">
              <IonIcon icon={addCircleOutline} />
              Top Up Wallet
            </a>
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div className="db-section">
            <h2 className="db-section-title">Quick Actions</h2>
            <div className="db-actions-grid">
              {quickActions.map((action) => (
                <a key={action.title} href={action.path} className="db-action-card">
                  <div className="db-action-icon" style={{ background: `${action.color}18`, color: action.color }}>
                    <IonIcon icon={action.icon} />
                  </div>
                  <div className="db-action-text">
                    <span className="db-action-title">{action.title}</span>
                    <span className="db-action-sub">{action.subtitle}</span>
                  </div>
                  <IonIcon icon={chevronForward} className="db-action-arrow" />
                </a>
              ))}
            </div>
          </div>

          {/* ── STATS ROW ── */}
          <div className="db-section">
            <h2 className="db-section-title">Overview</h2>
            <div className="db-stats-row">
              <div className="db-stat-card">
                <div className="db-stat-icon db-stat-icon--blue">
                  <IonIcon icon={cartOutline} />
                </div>
                <div className="db-stat-info">
                  <span className="db-stat-value">{recentOrdersCount}</span>
                  <span className="db-stat-label">Recent Orders</span>
                </div>
              </div>
              <div className="db-stat-card">
                <div className="db-stat-icon db-stat-icon--emerald">
                  <IonIcon icon={documentTextOutline} />
                </div>
                <div className="db-stat-info">
                  <span className="db-stat-value">{regCount ?? 0}</span>
                  <span className="db-stat-label">Registrations</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── REFERRAL CARD ── */}
          {(referralStats as any)?.total_earned > 0 && (
            <div className="db-section">
              <div className="db-referral-card">
                <div className="db-referral-top">
                  <div className="db-referral-icon">
                    <IonIcon icon={giftOutline} />
                  </div>
                  <div className="db-referral-info">
                    <span className="db-referral-title">Referral Earnings</span>
                    <span className="db-referral-amount">
                      <AmountDisplay value={(referralStats as any)?.total_earned ?? 0} showToggle={false} className="amount-display--dark" />
                    </span>
                  </div>
                </div>
                <div className="db-referral-stats">
                  <span className="db-referral-stat">
                    <IonIcon icon={checkmarkCircleOutline} />
                    {(referralStats as any)?.successful || 0} successful
                  </span>
                  <span className="db-referral-stat">
                    <IonIcon icon={timeOutline} />
                    {(referralStats as any)?.pending || 0} pending
                  </span>
                </div>
                <Link to="/referrals" className="db-referral-link">
                  Refer & Earn
                  <IonIcon icon={arrowForward} />
                </Link>
              </div>
            </div>
          )}

        </div>
      </DashboardLayout>
    </IonPage>
  );
};

export default DashboardPage;
