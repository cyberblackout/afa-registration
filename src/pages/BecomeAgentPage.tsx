import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonPage,
  IonButton, IonToast, IonLoading,
} from '@ionic/react';
import {
  Tag, Wallet, Users, TrendingUp, ShieldCheck,
  CheckCircle, ArrowRight, UserPlus, DollarSign,
} from 'lucide-react';
import { settingsApi, pricingApi, agentApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AmountDisplay from '../components/AmountDisplay';
import './BecomeAgentPage.css';

// Load Paystack Inline script (same pattern as WalletPage)
let paystackScriptLoaded = false;
const loadPaystackScript = (): Promise<void> => {
  if (paystackScriptLoaded && (window as any).PaystackPop) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) {
      paystackScriptLoaded = true;
      resolve();
      return;
    }
    const existingScript = document.querySelector('script[src*="paystack"]');
    if (existingScript) {
      const interval = setInterval(() => {
        if ((window as any).PaystackPop) {
          clearInterval(interval);
          paystackScriptLoaded = true;
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(interval); reject(new Error('Paystack script timed out')); }, 10000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => {
      const waitForPop = setInterval(() => {
        if ((window as any).PaystackPop) {
          clearInterval(waitForPop);
          paystackScriptLoaded = true;
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(waitForPop); reject(new Error('Paystack script timed out')); }, 10000);
    };
    script.onerror = () => reject(new Error('Failed to load Paystack'));
    document.head.appendChild(script);
  });
};

const benefits = [
  { icon: Tag, title: 'Exclusive Agent Pricing', desc: 'Agents receive special registration prices lower than normal customer prices, helping you provide affordable services.' },
  { icon: Wallet, title: 'Earn Commissions', desc: 'Make profit from every customer registration completed through your agent account.' },
  { icon: Users, title: 'Grow Your Customer Base', desc: 'Register more customers and build a successful AFA service business.' },
  { icon: TrendingUp, title: 'Increase Your Income', desc: 'The more customers you serve, the more opportunities you have to earn.' },
  { icon: ShieldCheck, title: 'Trusted Platform', desc: 'Operate securely with MTN-backed agent tools and support.' },
  { icon: Tag, title: 'Agent Badge & ID', desc: 'Get verified agent status with a professional Agent ID and badge.' },
];

const steps = [
  { icon: UserPlus, title: 'Create Agent Account', desc: 'Sign up and submit your agent application in minutes.' },
  { icon: CheckCircle, title: 'Get Approved', desc: 'Our team reviews and approves your application quickly.' },
  { icon: Users, title: 'Register Customers', desc: 'Start registering customers at exclusive agent prices.' },
  { icon: DollarSign, title: 'Earn Commissions', desc: 'Make profit on every successful registration you complete.' },
];

const BecomeAgentPage: React.FC = () => {
  const history = useHistory();
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', color: 'success' });

  const { data: agentFeeData, isLoading: feeLoading, isError: feeError } = useQuery({
    queryKey: ['agent_fee'],
    queryFn: () => settingsApi.getSetting('agent_fee'),
    staleTime: 300000,
  });

  const { data: afaPricingData, isLoading: pricingLoading, isError: pricingError } = useQuery({
    queryKey: ['afa_registration_price'],
    queryFn: async () => {
      const allPricing = await pricingApi.get();
      return (allPricing as any[]).find((p) => p.key === 'afa_registration') || null;
    },
    staleTime: 300000,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['agent_fee'] });
    await queryClient.invalidateQueries({ queryKey: ['afa_registration_price'] });
  };

  const isLoadingData = feeLoading || pricingLoading;
  const hasError = feeError || pricingError;

  const agentFee = Number(agentFeeData ?? 100);
  const normalPrice = Number(afaPricingData?.normal_price ?? afaPricingData?.amount ?? 0);
  const agentPrice = Number(afaPricingData?.agent_price ?? 0);
  const profitPerRegistration = Math.max(normalPrice - agentPrice, 0);
  const profitExampleCustomers = 100;
  const estimatedEarnings = profitPerRegistration * profitExampleCustomers;

  // Load Paystack script on mount
  useEffect(() => { loadPaystackScript().catch(() => {}); }, []);

  const handleApply = async () => {
    setLoading(true);
    try {
      // Step 1: Initiate agent application server-side (creates pending record + Paystack transaction)
      const initData = await agentApi.initiateApplication() as any;
      if (!initData?.access_code || !initData?.reference) {
        throw new Error(initData?.error || 'Failed to initiate payment');
      }

      // Step 2: Load Paystack script and open popup
      await loadPaystackScript();

      const PaystackPop = (window as any).PaystackPop;
      if (!PaystackPop || typeof PaystackPop.setup !== 'function') {
        throw new Error('Payment system failed to initialize. Please refresh and try again.');
      }

      const reference = initData.reference;
      const applicationId = initData.application_id;

      // Poll for payment verification (max 30 seconds)
      const pollPaymentStatus = async () => {
        for (let i = 0; i < 15; i++) {
          try {
            const result = await agentApi.verifyApplication(reference) as any;
            if (result?.payment_status === 'paid') {
              return result;
            }
            if (result?.payment_status === 'failed') {
              throw new Error('Payment was not successful. Please try again.');
            }
          } catch (err: any) {
            if (err.message?.includes('not successful')) throw err;
          }
          await new Promise(r => setTimeout(r, 2000));
        }
        // Timeout — payment may still be processing via webhook
        return { payment_status: 'paid', status: 'pending' };
      };

      const handler = PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string,
        email: user?.email || '',
        amount: Math.round(initData.amount * 100),
        currency: 'GHS',
        ref: reference,
        access_code: initData.access_code,
        channels: ['mobile_money', 'card', 'bank'],
        callback: () => {
          setLoading(true);
          setToast({ show: true, message: 'Payment received! Verifying...', color: 'success' });
          pollPaymentStatus()
            .then((result: any) => {
              if (result?.status === 'approved') {
                // Auto-approved — update local role
                if (user) {
                  useAuthStore.getState().setUser({ ...user, role: 'agent' }, 'agent');
                }
                setToast({ show: true, message: 'Congratulations! You are now an agent!', color: 'success' });
                setTimeout(() => history.push('/agent/dashboard'), 2000);
              } else {
                // Pending admin approval
                setToast({ show: true, message: 'Application submitted! Waiting for admin approval.', color: 'success' });
                setTimeout(() => history.push('/dashboard'), 2000);
              }
            })
            .catch((err: any) => {
              setToast({ show: true, message: err.message || 'Payment verification failed', color: 'danger' });
            })
            .finally(() => setLoading(false));
        },
        onClose: () => {
          setLoading(false);
          setToast({ show: true, message: 'Payment cancelled. If you already paid, it will be processed shortly.', color: 'warning' });
        },
      });

      if (!handler || typeof handler.openIframe !== 'function') {
        throw new Error('Payment system failed to initialize the checkout. Please try again.');
      }
      handler.openIframe();
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Something went wrong', color: 'danger' });
      setLoading(false);
    }
  };

  return (
    <IonPage>
    <DashboardLayout onRefresh={handleRefresh}>
      <div className="ba-page">
        {/* ===== HERO ===== */}
        <section className="ba-hero">
          <div className="ba-hero-content">
            <h1 className="ba-hero-title">Become an MTN AFA Agent</h1>
            <p className="ba-hero-sub">
              Register customers at affordable agent prices and earn commissions on every successful registration.
            </p>
            <div className="ba-hero-actions">
              <IonButton className="ba-btn-primary" onClick={handleApply} disabled={loading}>
                Become an Agent Now
                <ArrowRight size={18} style={{ marginLeft: 8 }} />
              </IonButton>
              <IonButton className="ba-btn-secondary" onClick={() => document.getElementById('ba-how')?.scrollIntoView({ behavior: 'smooth' })}>
                How It Works
              </IonButton>
            </div>
          </div>
        </section>

        {hasError && !isLoadingData && (
          <div className="ba-error-banner" style={{ padding: '1rem', textAlign: 'center', color: 'var(--ion-color-danger, #eb445b)' }}>
            <p>Failed to load pricing data. Please try again.</p>
            <IonButton fill="clear" onClick={handleRefresh}>Retry</IonButton>
          </div>
        )}

        {/* ===== BENEFITS ===== */}
        <section className="ba-section">
          <div className="ba-section-header">
            <h2>Why Become an Agent?</h2>
            <p>Unlock exclusive benefits designed to help you grow your business</p>
          </div>
          <div className="ba-benefits-grid">
            {benefits.map((b) => {
              const IconEl = b.icon;
              return (
                <div key={b.title} className="ba-benefit-card">
                  <div className="ba-benefit-icon-wrap">
                    <IconEl size={20} />
                  </div>
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ===== PRICE COMPARISON ===== */}
        <section className="ba-section ba-comparison-section">
          <div className="ba-section-header">
            <h2>Agents Get Better Registration Benefits</h2>
            <p>See the difference between a normal user and an AFA Agent</p>
          </div>
          <div className="ba-comparison">
            <table className="ba-compare-table">
              <thead>
                <tr>
                  <th className="ba-compare-empty" />
                  <th className="ba-compare-col ba-compare-normal">
                    <span className="ba-compare-label">Normal User</span>
                  </th>
                  <th className="ba-compare-col ba-compare-agent">
                    <span className="ba-compare-label">AFA Agent</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ba-compare-feature">Registration Price</td>
                  <td className="ba-compare-normal">Standard price</td>
                  <td className="ba-compare-agent ba-discounted">Discounted agent price</td>
                </tr>
                <tr>
                  <td className="ba-compare-feature">Register yourself</td>
                  <td className="ba-compare-normal"><CheckCircle size={16} className="ba-check-green" /></td>
                  <td className="ba-compare-agent"><CheckCircle size={16} className="ba-check-green" /></td>
                </tr>
                <tr>
                  <td className="ba-compare-feature">Register customers</td>
                  <td className="ba-compare-normal"><span className="ba-cross">✗</span></td>
                  <td className="ba-compare-agent"><CheckCircle size={16} className="ba-check-green" /></td>
                </tr>
                <tr>
                  <td className="ba-compare-feature">Earn commissions</td>
                  <td className="ba-compare-normal"><span className="ba-cross">✗</span></td>
                  <td className="ba-compare-agent"><CheckCircle size={16} className="ba-check-green" /></td>
                </tr>
                <tr>
                  <td className="ba-compare-feature">Access agent tools</td>
                  <td className="ba-compare-normal"><span className="ba-cross">✗</span></td>
                  <td className="ba-compare-agent"><CheckCircle size={16} className="ba-check-green" /></td>
                </tr>
                <tr>
                  <td className="ba-compare-feature">Agent dashboard</td>
                  <td className="ba-compare-normal"><span className="ba-cross">✗</span></td>
                  <td className="ba-compare-agent"><CheckCircle size={16} className="ba-check-green" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== PROFIT EXAMPLE ===== */}
        <section className="ba-section">
          <div className="ba-section-header">
            <h2>See Your Earning Potential</h2>
            <p>Calculate how much you can earn as an MTN AFA Agent</p>
          </div>
          <div className="ba-profit-card">
            <div className="ba-profit-grid">
              <div className="ba-profit-item">
                <span className="ba-profit-label">Customer Registrations</span>
                <span className="ba-profit-value">100 customers</span>
              </div>
              <div className="ba-profit-divider" />
              <div className="ba-profit-item">
                <span className="ba-profit-label">Profit per registration</span>
                <span className="ba-profit-value ba-profit-accent"><AmountDisplay value={profitPerRegistration ?? 0} showToggle={false} /></span>
              </div>
              <div className="ba-profit-divider" />
              <div className="ba-profit-item">
                <span className="ba-profit-label">Estimated earnings</span>
                <span className="ba-profit-value ba-profit-highlight"><AmountDisplay value={estimatedEarnings ?? 0} showToggle={false} /></span>
              </div>
            </div>
            <p className="ba-profit-note">The more customers you register, the more you earn.</p>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="ba-how" className="ba-section ba-how-section">
          <div className="ba-section-header">
            <h2>How It Works</h2>
            <p>Get started in four simple steps</p>
          </div>
          <div className="ba-steps">
            {steps.map((s, i) => {
              const IconEl = s.icon;
              return (
                <div key={s.title} className="ba-step">
                  <div className="ba-step-number">{i + 1}</div>
                  <div className="ba-step-icon-wrap">
                    <IconEl size={24} />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="ba-section">
          <div className="ba-cta-card">
            <div className="ba-cta-content">
              <h2>Ready to Start Your Agent Journey?</h2>
              <p>Join MTN AFA Agents today and start building your customer network.</p>
              <div className="ba-cta-price-row">
                <span className="ba-cta-price-label">Registration Fee</span>
                <span className="ba-cta-price-amount"><AmountDisplay value={agentFee ?? 0} showToggle={false} /></span>
                <span className="ba-cta-price-note">One-time payment, non-refundable</span>
              </div>
              <div className="ba-cta-includes">
                <p className="ba-includes-title">What you get:</p>
                <div className="ba-includes-list">
                  {['Discounted agent prices on all packages', 'Dedicated agent dashboard and analytics', 'Bulk registration capabilities', 'Commission tracking and withdrawal', 'Professional Agent ID & verification badge'].map((t) => (
                    <div key={t} className="ba-includes-item">
                      <CheckCircle size={16} />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
              <IonButton className="ba-btn-cta" onClick={handleApply} disabled={loading}>
                {loading ? 'Processing...' : 'Apply Now'}
                <ArrowRight size={18} style={{ marginLeft: 8 }} />
              </IonButton>
              <p className="ba-cta-disclaimer">
                Payment will be deducted from your wallet balance.
                {user && <span> Current balance: <AmountDisplay value={user.wallet_balance || 0} showToggle={false} /></span>}
              </p>
            </div>
          </div>
        </section>

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
    </IonPage>
  );
};

export default BecomeAgentPage;
