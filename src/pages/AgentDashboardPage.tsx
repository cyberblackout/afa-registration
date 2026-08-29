import React from 'react';
import { IonPage, IonIcon } from '@ionic/react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi, profileApi } from '../services/api';
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
  ribbonOutline,
  peopleOutline,
  cashOutline,
  chevronForward,
  timeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import './AgentDashboardPage.css';

const quickActions = [
  { icon: addCircleOutline, title: 'Register AFA', subtitle: 'New order', path: '/register-afa', color: '#FFCB05' },
  { icon: walletOutline, title: 'Wallet', subtitle: 'Top up', path: '/wallet', color: '#10b981' },
  { icon: cartOutline, title: 'Orders', subtitle: 'Track', path: '/orders', color: '#3b82f6' },
  { icon: personOutline, title: 'Profile', subtitle: 'Account', path: '/profile', color: '#8b5cf6' },
  { icon: giftOutline, title: 'Referral', subtitle: 'Earn', path: '/referrals', color: '#f59e0b' },
  { icon: notificationsOutline, title: 'Notifications', subtitle: 'Alerts', path: '/notifications', color: '#ef4444' },
];

const AgentDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading, isError } = useQuery({
    queryKey: ['agent_dashboard', user?.id],
    queryFn: () => agentApi.getDashboard() as any,
    enabled: !!user?.id,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['agent_profile', user?.id],
    queryFn: () => profileApi.get(user!.id),
    enabled: !!user?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['agent_dashboard', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['agent_profile', user?.id] });
  };

  const isLoadingAll = isLoading || profileLoading;
  const balance = Number((profile as any)?.wallet_balance ?? user?.wallet_balance ?? 0);
  const displayName = profile?.full_name || user?.full_name || 'Agent';
  const firstName = displayName.split(' ')[0];

  if (isLoadingAll) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="ag-page">
            <div className="ag-skeleton">
              <div className="ag-skeleton-line ag-skeleton-line--lg" />
              <div className="ag-skeleton-card" />
              <div className="ag-skeleton-row">
                <div className="ag-skeleton-card" />
                <div className="ag-skeleton-card" />
              </div>
            </div>
          </div>
        </DashboardLayout>
      </IonPage>
    );
  }

  if (isError) {
    return (
      <IonPage>
        <DashboardLayout onRefresh={handleRefresh}>
          <div className="ag-page">
            <div className="ag-error">
              <p>Failed to load agent dashboard.</p>
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
        <div className="ag-page">

          {/* ── GREETING ── */}
          <div className="ag-greeting">
            <div className="ag-greeting-text">
              <h1>Welcome back, {firstName} <span className="ag-wave">👋</span></h1>
              <p>Manage your MTN AFA services</p>
            </div>
            <span className="ag-role-badge">
              <IonIcon icon={personOutline} />
              Agent
            </span>
          </div>

          {/* ── WALLET CARD ── */}
          <div className="ag-wallet-card">
            <div className="ag-wallet-top">
              <div className="ag-wallet-label">
                <IonIcon icon={walletOutline} />
                <span>Wallet Balance</span>
              </div>
              <a href="/wallet" className="ag-wallet-history-btn">
                <IonIcon icon={timeOutline} />
                History
              </a>
            </div>
            <div className="ag-wallet-balance">
              <AmountDisplay value={balance} className="amount-display--dark ag-wallet-amount-display" />
            </div>
            <a href="/wallet" className="ag-wallet-topup-btn">
              <IonIcon icon={addCircleOutline} />
              Top Up Wallet
            </a>
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div className="ag-section">
            <h2 className="ag-section-title">Quick Actions</h2>
            <div className="ag-actions-grid">
              {quickActions.map((action) => (
                <a key={action.title} href={action.path} className="ag-action-card">
                  <div className="ag-action-icon" style={{ background: `${action.color}18`, color: action.color }}>
                    <IonIcon icon={action.icon} />
                  </div>
                  <div className="ag-action-text">
                    <span className="ag-action-title">{action.title}</span>
                    <span className="ag-action-sub">{action.subtitle}</span>
                  </div>
                  <IonIcon icon={chevronForward} className="ag-action-arrow" />
                </a>
              ))}
            </div>
          </div>

          {/* ── STATS ROW ── */}
          <div className="ag-section">
            <h2 className="ag-section-title">Overview</h2>
            <div className="ag-stats-row">
              <div className="ag-stat-card">
                <div className="ag-stat-icon ag-stat-icon--emerald">
                  <IonIcon icon={peopleOutline} />
                </div>
                <div className="ag-stat-info">
                  <span className="ag-stat-value">{dashboard?.registrations_count || 0}</span>
                  <span className="ag-stat-label">Registrations</span>
                </div>
              </div>
              <div className="ag-stat-card">
                <div className="ag-stat-icon ag-stat-icon--blue">
                  <IonIcon icon={cartOutline} />
                </div>
                <div className="ag-stat-info">
                  <span className="ag-stat-value">{dashboard?.orders_count || 0}</span>
                  <span className="ag-stat-label">Orders</span>
                </div>
              </div>
              <div className="ag-stat-card">
                <div className="ag-stat-icon ag-stat-icon--amber">
                  <IonIcon icon={cashOutline} />
                </div>
                <div className="ag-stat-info">
                  <span className="ag-stat-value">
                    <AmountDisplay value={dashboard?.total_earnings || 0} showToggle={false} />
                  </span>
                  <span className="ag-stat-label">Total Earnings</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </DashboardLayout>
    </IonPage>
  );
};

export default AgentDashboardPage;
