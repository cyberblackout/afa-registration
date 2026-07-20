import React from 'react';
import { IonPage, IonIcon, IonToast } from '@ionic/react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import MTNAFABanner from '../components/MTNAFABanner';
import { motion } from 'framer-motion';
import {
  walletOutline,
  cartOutline,
  documentTextOutline,
  addCircleOutline,
  personOutline,
  giftOutline,
  arrowForward,
} from 'ionicons/icons';
import './DashboardPage.css';

const quickActions = [
  { icon: addCircleOutline, title: 'Register AFA', subtitle: 'Create new order', path: '/register-afa' },
  { icon: walletOutline, title: 'Wallet', subtitle: 'Top up and review', path: '/wallet' },
  { icon: cartOutline, title: 'Orders', subtitle: 'Track submissions', path: '/orders' },
  { icon: personOutline, title: 'Profile', subtitle: 'Manage account', path: '/profile' },
];

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: walletData } = useQuery({
    queryKey: ['wallet', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: regCount } = useQuery({
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

  const balance = walletData?.wallet_balance ?? 0;
  const orders = ordersData ?? [];
  const recentOrdersCount = orders.length;

  const { data: referralStats } = useQuery({
    queryKey: ['referral_stats_dash', user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_referral_stats');
      return data as any || { total_invited: 0, successful: 0, pending: 0, total_earned: 0 };
    },
    enabled: !!user?.id,
  });

  return (
    <IonPage>
      <DashboardLayout>
        <div className="dashboard-container">
          <MTNAFABanner
            userName={profile?.full_name || user?.full_name || 'User'}
            role="user"
            newRegistrationHref="/register-afa"
            secondaryActionHref="/become-agent"
          />

          <div className="stats-grid">
            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="stat-card-header">
                <IonIcon icon={walletOutline} className="stat-icon wallet-icon" />
                <span className="stat-label">Wallet Balance</span>
              </div>
              <p className="stat-value">GH₵ {balance.toFixed(2)}</p>
              <a href="/wallet" className="stat-btn wallet-btn">Top Up Wallet</a>
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <div className="stat-card-header">
                <IonIcon icon={cartOutline} className="stat-icon orders-icon" />
                <span className="stat-label">Recent Orders</span>
              </div>
              <p className="stat-value">{recentOrdersCount}</p>
              <a href="/orders" className="stat-btn">View Orders</a>
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="stat-card-header">
                <IonIcon icon={documentTextOutline} className="stat-icon reg-icon" />
                <span className="stat-label">Total Registrations</span>
              </div>
              <p className="stat-value">{regCount ?? 0}</p>
              <a href="/register-afa" className="stat-btn">New AFA Registration</a>
            </motion.div>

            <motion.div
              className="stat-card referral-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <div className="stat-card-header">
                <IonIcon icon={giftOutline} className="stat-icon" style={{ color: '#8b5cf6' }} />
                <span className="stat-label">Referral Earnings</span>
              </div>
              <p className="stat-value" style={{ fontSize: 22 }}>GH₵ {Number(referralStats?.total_earned || 0).toFixed(2)}</p>
              <p className="stat-sub" style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
                {referralStats?.successful || 0} successful · {referralStats?.pending || 0} pending
              </p>
              <Link to="/referrals" className="stat-btn" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                Refer & Earn
              </Link>
            </motion.div>
          </div>

          <div className="quick-actions-section">
            <h2 className="section-title">Quick Actions</h2>
            <div className="quick-actions-grid">
              {quickActions.map((action) => (
                <motion.a
                  key={action.title}
                  href={action.path}
                  className="quick-action-card"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className="quick-action-icon">
                    <IonIcon icon={action.icon} />
                  </div>
                  <div className="quick-action-text">
                    <h3>{action.title}</h3>
                    <p>{action.subtitle}</p>
                  </div>
                  <IonIcon icon={arrowForward} className="quick-action-arrow" />
                </motion.a>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    </IonPage>
  );
};

export default DashboardPage;
