import React from 'react';
import { IonIcon, IonButton, IonSpinner } from '@ionic/react';
import { flashOutline, checkmarkCircleOutline, arrowForward, cashOutline } from 'ionicons/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import './AgentPricingPage.css';

const AgentPricingPage: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['agent_pricing_page'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_agent_pricing');
      return data as any || { pricing: [], user_role: 'user' };
    },
  });

  const isAgent = data?.user_role === 'agent' || data?.user_role === 'admin';

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="agent-loading"><IonSpinner name="crescent" /><p>Loading pricing...</p></div>
      </DashboardLayout>
    );
  }

  const totalSavings = data?.pricing?.reduce((s: number, p: any) => s + (p.savings || 0), 0) || 0;

  return (
    <DashboardLayout>
      <div className="agent-pricing-page">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pricing-header">
          <div className="pricing-header-icon"><IonIcon icon={flashOutline} /></div>
          <h1>{isAgent ? 'Your Agent Pricing' : 'Agent Pricing Plans'}</h1>
          <p>Exclusive discounted rates for registered agents</p>
        </motion.div>

        {isAgent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="savings-banner"
          >
            <IonIcon icon={cashOutline} />
            <span>You save a total of <strong>GHS {totalSavings}</strong> on agent pricing!</span>
          </motion.div>
        )}

        <div className="pricing-cards">
          {data?.pricing?.map((p: any, i: number) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="pricing-card"
            >
              <div className="pricing-card-header">
                <h3>{p.label}</h3>
              </div>
              <div className="pricing-card-body">
                <div className="price-row normal">
                  <span className="price-label">Normal Price</span>
                  <span className="price-value">GHS {p.normal_price}</span>
                </div>
                {isAgent && p.agent_price && (
                  <div className="price-row agent">
                    <span className="price-label">Agent Price</span>
                    <span className="price-value agent-price-value">GHS {p.agent_price}</span>
                  </div>
                )}
                {isAgent && p.savings > 0 && (
                  <div className="savings-badge">Save GHS {p.savings}</div>
                )}
              </div>
              <div className="pricing-card-footer">
                <div className="features">
                  <div className="feature"><IonIcon icon={checkmarkCircleOutline} />Fast processing</div>
                  <div className="feature"><IonIcon icon={checkmarkCircleOutline} />Verified documents</div>
                  <div className="feature"><IonIcon icon={checkmarkCircleOutline} />Official receipt</div>
                </div>
                <Link to="/register-afa">
                  <IonButton expand="block" fill="outline" className="pricing-cta">
                    {isAgent ? 'Register at Agent Price' : 'Register Now'} <IonIcon icon={arrowForward} slot="end" />
                  </IonButton>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        {!isAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="become-agent-prompt"
          >
            <p>Want to access these exclusive prices?</p>
            <Link to="/become-agent">
              <IonButton expand="block" className="become-agent-btn">
                Become an Agent <IonIcon icon={arrowForward} slot="end" />
              </IonButton>
            </Link>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AgentPricingPage;
