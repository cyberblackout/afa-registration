import React, { Suspense } from 'react';
import { IonButton, IonIcon, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
  peopleOutline,
  documentTextOutline,
  walletOutline,
  cashOutline,
  timeOutline,
  trendingUpOutline,
  trendingDownOutline,
  arrowForward,
  checkmarkCircle,
  closeCircle,
  hourglassOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminDashboardApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import Card from '../../components/Card';
import { M3Skeleton, M3SkeletonList } from '../../components/M3Skeleton';
import { Sparkline } from '../../components/Sparkline';
import { useIsMobile } from '../../hooks/useIsMobile';
import { safeNumber } from '../../utils/number';
import './DashboardPage.css';

const DashboardCharts = React.lazy(() => import('./DashboardCharts'));

const statusConfig = {
  approved: { label: 'Approved', icon: checkmarkCircle, className: 'status-approved' },
  pending: { label: 'Pending', icon: hourglassOutline, className: 'status-pending' },
  rejected: { label: 'Rejected', icon: closeCircle, className: 'status-rejected' },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0, transition: { duration: 0.4, delay: i * 0.08 },
  }),
};

const formatCurrency = (value: number) =>
  `GH₵ ${safeNumber(value).toLocaleString()}`;

const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const history = useHistory();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_weekly_data'] });
  };

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_dashboard'],
    queryFn: () => adminDashboardApi.getStats(),
  });

  const {
    data: weeklyData,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useQuery({
    queryKey: ['admin_weekly_data'],
    queryFn: async () => {
      const chartData = await adminDashboardApi.getDailyChart();
      return chartData;
    },
  });

  const series = (weeklyData ?? []) as { day?: string; revenue?: number; registrations?: number }[];
  const revenueSeries = series.map((d) => safeNumber(d.revenue));
  const regsSeries = series.map((d) => safeNumber(d.registrations));

  // Lightweight mobile trend summary: last day vs previous day of the
  // 7-day revenue series (feeds the sparkline card's delta chip).
  const revenueDelta =
    revenueSeries.length >= 2 ? revenueSeries[revenueSeries.length - 1] - revenueSeries[revenueSeries.length - 2] : null;
  const revenueTrendUp = revenueDelta !== null && revenueDelta >= 0;

  const statCards = [
    { label: 'Total Users', value: stats ? stats.total_users.toLocaleString() : '...', icon: peopleOutline, color: '#3b82f6' },
    { label: 'Total Registrations', value: stats ? stats.total_registrations.toLocaleString() : '...', icon: documentTextOutline, color: '#10b981' },
    { label: 'Wallet Balance', value: stats ? formatCurrency(stats.total_wallet_balance) : '...', icon: walletOutline, color: '#f59e0b' },
    { label: 'Revenue', value: stats ? formatCurrency(stats.revenue) : '...', icon: cashOutline, color: '#8b5cf6' },
    { label: 'Pending Approvals', value: stats ? stats.pending_registrations.toLocaleString() : '...', icon: timeOutline, color: '#ef4444' },
  ];

  const quickStats = [
    { label: "Today's Registrations", value: stats?.today_registrations ?? 0, color: '#3b82f6' },
    { label: 'Processing', value: stats?.processing_registrations ?? 0, color: '#f59e0b' },
    { label: 'Approved', value: stats?.approved_registrations ?? 0, color: '#10b981' },
    { label: 'Rejected', value: stats?.rejected_registrations ?? 0, color: '#ef4444' },
    { label: 'Completed', value: stats?.completed_registrations ?? 0, color: '#8b5cf6' },
  ];

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-dashboard">
        <motion.div
          className="dashboard-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h1>Dashboard</h1>
            <p className="dashboard-subtitle">Real-time overview of your platform</p>
          </div>
          <div className="dashboard-header-badge">
            <IonIcon icon={trendingUpOutline} />
            <span>Live data</span>
          </div>
        </motion.div>

        {/* Mobile: swipeable M3 KPI carousel with SVG sparklines.
            Desktop: 5-card grid + Recharts (lazy chunk, never loaded here). */}
        {isMobile && (
          <div className="kpi-carousel" role="list" aria-label="Key metrics">
            {isError ? (
              <div className="kpi-card kpi-card--error" role="listitem">
                <p className="kpi-label">Failed to load</p>
                <IonButton fill="clear" size="small" onClick={() => refetch()}>Retry</IonButton>
              </div>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <M3Skeleton key={i} className="kpi-card kpi-card--skeleton" height={132} radius="var(--m3-radius-md)" />
              ))
            ) : (
              <>
                <div className="kpi-card" role="listitem">
                  <div className="kpi-card-top">
                    <span className="kpi-label">Revenue trend</span>
                    <IonIcon icon={cashOutline} className="kpi-icon" />
                  </div>
                  <p className="kpi-value m3-numeric">{formatCurrency(stats?.revenue ?? 0)}</p>
                  {revenueSeries.length > 1 && (
                    <Sparkline data={revenueSeries} width={140} height={36} className="kpi-spark" />
                  )}
                  <span className="kpi-footnote">
                    {revenueDelta !== null ? (
                      <>
                        <span className={`kpi-trend ${revenueTrendUp ? 'kpi-trend--up' : 'kpi-trend--down'}`}>
                          <IonIcon icon={revenueTrendUp ? trendingUpOutline : trendingDownOutline} />
                          {revenueTrendUp ? '+' : '−'}{formatCurrency(Math.abs(revenueDelta))}
                        </span>
                        vs prev day
                      </>
                    ) : (
                      'Last 7 days'
                    )}
                  </span>
                </div>

                <div className="kpi-card" role="listitem">
                  <div className="kpi-card-top">
                    <span className="kpi-label">Today's Regs</span>
                    <IonIcon icon={documentTextOutline} className="kpi-icon" />
                  </div>
                  <p className="kpi-value m3-numeric">{stats?.today_registrations ?? 0}</p>
                  {regsSeries.length > 1 && (
                    <Sparkline data={regsSeries} width={140} height={36} stroke="var(--m3-info)" className="kpi-spark" />
                  )}
                  <span className="kpi-footnote">Daily volume</span>
                </div>

                <button
                  type="button"
                  className="kpi-card kpi-card--warning"
                  role="listitem"
                  onClick={() => history.push('/cyberin/registrations')}
                >
                  <div className="kpi-card-top">
                    <span className="kpi-label">Pending approvals</span>
                    <IonIcon icon={timeOutline} className="kpi-icon" />
                  </div>
                  <p className="kpi-value m3-numeric">{stats?.pending_registrations ?? 0}</p>
                  <span className="kpi-footnote kpi-footnote--action">
                    Review queue <IonIcon icon={arrowForward} />
                  </span>
                </button>

                <div className="kpi-card" role="listitem">
                  <div className="kpi-card-top">
                    <span className="kpi-label">Total Users</span>
                    <IonIcon icon={peopleOutline} className="kpi-icon" />
                  </div>
                  <p className="kpi-value m3-numeric">{(stats?.total_users ?? 0).toLocaleString()}</p>
                  <span className="kpi-footnote">All accounts</span>
                </div>

                <div className="kpi-card" role="listitem">
                  <div className="kpi-card-top">
                    <span className="kpi-label">Wallet Pool</span>
                    <IonIcon icon={walletOutline} className="kpi-icon" />
                  </div>
                  <p className="kpi-value m3-numeric">{formatCurrency(stats?.total_wallet_balance ?? 0)}</p>
                  <span className="kpi-footnote">User balances</span>
                </div>
              </>
            )}
          </div>
        )}

        {!isMobile && (
          <div className="stat-cards-row">
            {isError ? (
              <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                <p>Failed to load dashboard. Please try again.</p>
                <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
              </div>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <M3Skeleton key={i} height={80} radius="var(--m3-radius-md)" />)
            ) : statCards.map((card, i) => (
              <Card
                key={card.label}
                variant="accent"
                className="stat-card"
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                style={{ borderLeftColor: card.color }}
              >
                <div className="stat-card-top">
                  <div className="stat-card-info">
                    <p className="stat-card-label">{card.label}</p>
                    <p className="stat-card-value">{card.value}</p>
                  </div>
                  <div className="stat-card-icon" style={{ background: `${card.color}15`, color: card.color }}>
                    <IonIcon icon={card.icon} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isMobile && (
          <div className="charts-grid">
            <Suspense
              fallback={
                <>
                  <M3Skeleton height={340} radius="var(--m3-radius-md)" />
                  <M3Skeleton height={340} radius="var(--m3-radius-md)" />
                </>
              }
            >
              <DashboardCharts
                weeklyData={weeklyData ?? []}
                isError={weeklyError}
                onRetry={() => refetchWeekly()}
              />
            </Suspense>
          </div>
        )}

        <div className="dashboard-bottom-grid">
          <Card
            className="recent-registrations-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <div className="card-header-row">
              <h3>Recent Registrations</h3>
              <a
                href="/cyberin/registrations"
                className="view-all-link"
                onClick={(e) => { e.preventDefault(); history.push('/cyberin/registrations'); }}
              >
                View All <IonIcon icon={arrowForward} />
              </a>
            </div>
            <div className="recent-list">
              {!stats ? (
                <M3SkeletonList count={3} lines={1} />
              ) : stats.recent_registrations.length === 0 ? (
                <p className="no-data-text">No recent registrations</p>
              ) : (
                stats.recent_registrations.map((reg, i) => {
                  const status = statusConfig[reg.status as keyof typeof statusConfig] || statusConfig.pending;
                  return (
                    <div key={reg.id || i} className="recent-row">
                      <div className="recent-row-left">
                        <div className="recent-avatar">{(reg.profiles?.full_name || 'U').charAt(0)}</div>
                        <div className="recent-info">
                          <p className="recent-name">{reg.profiles?.full_name || 'Unknown'}</p>
                          <p className="recent-phone">{reg.profiles?.phone || ''}</p>
                        </div>
                      </div>
                      <div className="recent-row-mid">
                        <span className="recent-date">{formatGhanaDate(reg.created_at)}</span>
                        <span className={`recent-status ${status.className}`}>
                          <IonIcon icon={status.icon} />
                          {status.label}
                        </span>
                      </div>
                      <a
                        href="/cyberin/registrations"
                        className="recent-action-btn"
                        onClick={(e) => { e.preventDefault(); history.push('/cyberin/registrations'); }}
                      >
                        View
                      </a>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card
            className="quick-stats-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <h3>Quick Stats</h3>
            <div className="quick-stats-grid">
              {quickStats.map((stat) => (
                <div key={stat.label} className="quick-stat-item">
                  <div className="quick-stat-bar" style={{ background: stat.color }} />
                  <div className="quick-stat-content">
                    <p className="quick-stat-value" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="quick-stat-label">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
    </IonPage>
  );
};

export default DashboardPage;
