import React from 'react';
import { Link } from 'react-router-dom';
import {
  IonContent, IonPage, IonCard, IonCardContent, IonIcon,
  IonText, IonButton, IonSpinner,
} from '@ionic/react';
import {
  ribbonOutline, peopleOutline, cartOutline, cashOutline,
  flashOutline, trendingUpOutline, gridOutline, walletOutline,
  addCircleOutline, documentTextOutline, checkmarkCircleOutline,
  timeOutline, closeCircleOutline, arrowForward,
} from 'ionicons/icons';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import MTNAFABanner from '../components/MTNAFABanner';
import './AgentDashboardPage.css';

const AgentDashboardPage: React.FC = () => {
  const { user } = useAuthStore();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['agent_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_agent_dashboard');
      return data as any || {};
    },
    enabled: !!user?.id,
  });

  const { data: pricing } = useQuery({
    queryKey: ['agent_pricing'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_agent_pricing');
      return data as any || { pricing: [] };
    },
  });

  const { data: profile } = useQuery({
    queryKey: ['agent_profile', user?.id],
    queryFn: () => supabase.from('profiles').select('*').eq('id', user?.id).single().then(r => r.data),
    enabled: !!user?.id,
  });

  const statsCards = [
    { icon: peopleOutline, label: 'Registrations', value: dashboard?.registrations_count || 0, color: '#4CAF50' },
    { icon: cartOutline, label: 'Orders', value: dashboard?.orders_count || 0, color: '#2196F3' },
    { icon: cashOutline, label: 'Total Earnings', value: `GHS ${Number(dashboard?.total_earnings || 0).toFixed(2)}`, color: '#FF9800' },
    { icon: flashOutline, label: 'Savings on Agent Pricing', value: pricing?.pricing?.reduce((s: number, p: any) => s + (p.savings || 0), 0) || 0, prefix: 'GHS ', color: '#9C27B0' },
  ];

  const statusIcon: Record<string, any> = {
    completed: checkmarkCircleOutline,
    approved: checkmarkCircleOutline,
    pending: timeOutline,
    rejected: closeCircleOutline,
  };

  const statusColor: Record<string, string> = {
    completed: '#2e7d32',
    approved: '#2e7d32',
    pending: '#f57f17',
    rejected: '#c62828',
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="agent-loading">
          <IonSpinner name="crescent" />
          <p>Loading agent dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="agent-dashboard-page">
        <MTNAFABanner
          userName={profile?.full_name || user?.full_name || 'Agent'}
          role="agent"
          newRegistrationHref="/register-afa"
          secondaryActionHref="/agent/pricing"
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
                <span className="stat-value">{card.prefix || ''}{card.value}</span>
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
            <Link to="/agent/pricing" className="quick-action-card">
              <IonIcon icon={flashOutline} />
              <span>View Agent Prices</span>
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

        <div className="agent-sections-grid">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="agent-section-card"
          >
            <div className="section-header">
              <IonIcon icon={peopleOutline} />
              <h2>Recent Registrations</h2>
            </div>
            {dashboard?.recent_registrations?.length > 0 ? (
              <div className="registration-list">
                {dashboard.recent_registrations.map((reg: any) => (
                  <div key={reg.id} className="registration-item">
                    <div className="reg-info">
                      <span className="reg-name">{reg.full_name}</span>
                      <span className="reg-date">{new Date(reg.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="reg-status" style={{ color: statusColor[reg.status] || '#666' }}>
                      <IonIcon icon={statusIcon[reg.status] || timeOutline} />
                      <span>{reg.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No registrations yet. Start registering customers!</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="agent-section-card"
          >
            <div className="section-header">
              <IonIcon icon={flashOutline} />
              <h2>Agent Pricing</h2>
            </div>
            {pricing?.pricing?.length > 0 ? (
              <div className="pricing-list">
                {pricing.pricing.map((p: any) => (
                  <div key={p.id} className="pricing-item">
                    <span className="pricing-label">{p.label}</span>
                    <div className="pricing-values">
                      <span className="normal-price">GHS {p.normal_price}</span>
                      <span className="agent-price">GHS {p.agent_price}</span>
                      {p.savings > 0 && (
                        <span className="pricing-savings">Save GHS {p.savings}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No pricing available.</p>
            )}
            <Link to="/agent/pricing" className="section-link">
              View all pricing <IonIcon icon={arrowForward} />
            </Link>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AgentDashboardPage;
