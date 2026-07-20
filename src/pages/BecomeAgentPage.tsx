import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonButton, IonCard, IonCardContent, IonIcon,
  IonToast, IonLoading,
} from '@ionic/react';
import {
  ribbonOutline, checkmarkCircleOutline, flashOutline,
  cashOutline, trendingUpOutline, peopleOutline, walletOutline,
  arrowForward, star, shieldCheckmarkOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import './BecomeAgentPage.css';

const benefits = [
  { icon: flashOutline, title: 'Agent Pricing', desc: 'Get exclusive discounted prices on all AFA registration packages' },
  { icon: cashOutline, title: 'Earn Commissions', desc: 'Earn commissions on every successful registration you make' },
  { icon: trendingUpOutline, title: 'Bulk Registrations', desc: 'Register multiple customers at once with special agent tools' },
  { icon: peopleOutline, title: 'Referral Network', desc: 'Build your customer network and grow your agent business' },
  { icon: star, title: 'Agent Badge', desc: 'Get verified agent status with a professional Agent ID' },
  { icon: walletOutline, title: 'Agent Dashboard', desc: 'Track your sales, earnings, and performance in real-time' },
];

const tests = [
  'Discounted agent prices on all packages',
  'Dedicated agent dashboard and analytics',
  'Bulk registration capabilities',
  'Commission tracking and withdrawal',
  'Professional Agent ID & verification badge',
];

const BecomeAgentPage: React.FC = () => {
  const history = useHistory();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', color: 'success' });

  const handleApply = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('apply_for_agent');
      if (error) throw error;
      if (data?.success) {
        if (data.auto_approved) {
          setToast({ show: true, message: `Congratulations! You are now an agent! Your Agent ID: ${data.agent_id}`, color: 'success' });
          if (user) {
            useAuthStore.getState().setUser({ ...user, role: 'agent' });
          }
          setTimeout(() => history.push('/agent/dashboard'), 2000);
        } else {
          setToast({ show: true, message: 'Application submitted! Waiting for admin approval.', color: 'success' });
          setTimeout(() => history.push('/dashboard'), 2000);
        }
      } else {
        setToast({ show: true, message: data?.error || 'Application failed', color: 'danger' });
      }
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Something went wrong', color: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="become-agent-page">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="agent-hero">
          <div className="agent-hero-icon">
            <IonIcon icon={ribbonOutline} />
          </div>
          <h1>Become an MTN AFA Agent</h1>
          <p className="agent-hero-sub">
            Unlock exclusive benefits, discounted pricing, and earn commissions by joining our agent program.
          </p>
        </motion.div>

        <div className="agent-benefits-grid">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="benefit-card"
            >
              <IonIcon icon={b.icon} className="benefit-icon" />
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="agent-cta-section"
        >
          <IonCard className="agent-cta-card">
            <IonCardContent>
              <div className="cta-header">
                <IonIcon icon={shieldCheckmarkOutline} className="cta-icon" />
                <h2>Agent Registration</h2>
              </div>
              <div className="cta-price">
                <span className="price-label">Registration Fee</span>
                <span className="price-amount">GHS 100</span>
                <span className="price-note">One-time payment, non-refundable</span>
              </div>
              <div className="cta-includes">
                <p className="includes-title">What you get:</p>
                {tests.map((t) => (
                  <div key={t} className="includes-item">
                    <IonIcon icon={checkmarkCircleOutline} />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <IonButton
                expand="block"
                className="apply-btn"
                onClick={handleApply}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Pay & Become an Agent'}
                <IonIcon icon={arrowForward} slot="end" />
              </IonButton>
              <p className="cta-disclaimer">
                Payment will be deducted from your wallet balance.
                {user && <span> Current balance: GHS {Number(user.wallet_balance || 0).toFixed(2)}</span>}
              </p>
            </IonCardContent>
          </IonCard>
        </motion.div>

        <IonLoading isOpen={loading} message="Processing your application..." />
        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={4000}
          color={toast.color as any}
          onDidDismiss={() => setToast({ ...toast, show: false })}
        />
      </div>
    </DashboardLayout>
  );
};

export default BecomeAgentPage;
