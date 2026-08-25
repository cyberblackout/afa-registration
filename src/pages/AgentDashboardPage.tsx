import React from 'react';
import { Link } from 'react-router-dom';
import {
  IonIcon, IonSpinner,
} from '@ionic/react';
import {
  ribbonOutline, peopleOutline, cartOutline, cashOutline,
  walletOutline, addCircleOutline, documentTextOutline,
} from 'ionicons/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { agentApi, profileApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import MTNAFABanner from '../components/MTNAFABanner';
import './AgentDashboardPage.css';

const AgentDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['agent_dashboard', user?.id],
    queryFn: () => agentApi.getDashboard() as any,
    enabled: !!user?.id,
  });

  const { data: profile } = useQuery({
    queryKey: ['agent_profile', user?.id],
    queryFn: () => profileApi.get(user!.id),
    enabled: !!user?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['agent_dashboard', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['agent_profile', user?.id] });
  };

  const statsCards = [
    { icon: peopleOutline, label: 'Registrations', value: dashboard?.registrations_count || 0, color: '#4CAF50' },
    { icon: cartOutline, label: 'Orders', value: dashboard?.orders_count || 0, color: '#2196F3' },
    { icon: cashOutline, label: 'Total Earnings', value: `GHS ${Number(dashboard?.total_earnings || 0).toFixed(2)}`, color: '#FF9800' },
    { icon: walletOutline, label: 'Wallet Balance', value: `GHS ${Number(user?.wallet_balance || 0).toFixed(2)}`, color: '#9C27B0' },
  ];

  if (isLoading) {
    return (
      <DashboardLayout onRefresh={handleRefresh}>
        <div className="agent-loading">
          <IonSpinner name="crescent" />
          <p>Loading agent dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout onRefresh={handleRefresh}>
      <div className="agent-dashboard-page">
        <MTNAFABanner
          userName={profile?.full_name || user?.full_name || 'Agent'}
          role="agent"
          newRegistrationHref="/register-afa"
        />

        <div className="agent-stats-grid">
          {statsCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="agent-stat-card"
            >
              <div className="stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
                <IonIcon icon={card.icon} />
              </div>
              <div className="stat-info">
                <span className="stat-label">{card.label}</span>
                <span className="stat-value">{card.value}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="agent-quick-actions">
          <h2>Quick Actions</h2>
          <div className="quick-actions-grid">
            <Link to="/register-afa" className="quick-action-card">
              <IonIcon icon={addCircleOutline} />
              <span>Register Customer</span>
            </Link>
            <Link to="/orders" className="quick-action-card">
              <IonIcon icon={documentTextOutline} />
              <span>My Orders</span>
            </Link>
            <Link to="/wallet" className="quick-action-card">
              <IonIcon icon={walletOutline} />
              <span>Wallet</span>
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AgentDashboardPage;
