import React from 'react';
import { IonIcon, IonPage } from '@ionic/react';
import {
  peopleOutline,
  documentTextOutline,
  walletOutline,
  cashOutline,
  timeOutline,
  trendingUpOutline,
  arrowForward,
  checkmarkCircle,
  closeCircle,
  hourglassOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { adminDashboardApi, type AdminDashboardStats } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import { formatGhanaDate } from '../../utils/date';
import './DashboardPage.css';

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
  `GH₵ ${value.toLocaleString()}`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="chart-tooltip-value" style={{ color: entry.color }}>
          {entry.name === 'revenue' ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

const Skeleton = ({ width, height }: { width?: string; height?: string }) => (
  <div className="skeleton-box" style={{ width: width || '100%', height: height || '60px', background: '#2a2a2a', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
);

const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin_dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['admin_weekly_data'] });
  };

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin_dashboard'],
    queryFn: () => adminDashboardApi.getStats(),
  });

  const { data: weeklyData } = useQuery({
    queryKey: ['admin_weekly_data'],
    queryFn: async () => {
      const chartData = await adminDashboardApi.getDailyChart();
      return chartData;
    },
  });

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

        <div className="stat-cards-row">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
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
            </motion.div>
          ))}
        </div>

        <div className="charts-grid">
          <motion.div
            className="chart-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="chart-card-header">
              <h3>Revenue Trend</h3>
              <span className="chart-period">Last 7 days</span>
            </div>
            {!weeklyData ? (
              <Skeleton height="280px" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={formatCurrency} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenue" stroke="#FFCB05" strokeWidth={3} dot={{ fill: '#FFCB05', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div
            className="chart-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="chart-card-header">
              <h3>Registrations Trend</h3>
              <span className="chart-period">Last 7 days</span>
            </div>
            {!weeklyData ? (
              <Skeleton height="280px" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="registrations" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        <div className="dashboard-bottom-grid">
          <motion.div
            className="recent-registrations-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <div className="card-header-row">
              <h3>Recent Registrations</h3>
              <a href="/cyberin/registrations" className="view-all-link">
                View All <IonIcon icon={arrowForward} />
              </a>
            </div>
            <div className="recent-list">
              {!stats ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height="48px" />)
              ) : stats.recent_registrations.length === 0 ? (
                <p className="no-data-text">No recent registrations</p>
              ) : (
                stats.recent_registrations.map((reg: any, i: number) => {
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
                      <a href={`/cyberin/registrations`} className="recent-action-btn">View</a>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          <motion.div
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
          </motion.div>
        </div>
      </div>
    </AdminLayout>
    </IonPage>
  );
};

export default DashboardPage;
