import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonButton, IonToast, IonLoading,
} from '@ionic/react';
import {
  Tag, Wallet, Users, TrendingUp, ShieldCheck,
  CheckCircle, ArrowRight, ChevronRight,
  Star, Phone, Clock, Zap, Network,
  UserCheck, LogIn, UserPlus, DollarSign,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import DashboardLayout from '../layouts/DashboardLayout';
import './BecomeAgentPage.css';

const benefits = [
  { icon: Tag, title: 'Exclusive Agent Pricing', desc: 'Agents receive special registration prices lower than normal customer prices, helping you provide affordable services.' },
  { icon: Wallet, title: 'Earn Commissions', desc: 'Make profit from every customer registration completed through your agent account.' },
  { icon: Users, title: 'Grow Your Customer Base', desc: 'Register more customers and build a successful AFA service business.' },
  { icon: TrendingUp, title: 'Increase Your Income', desc: 'The more customers you serve, the more opportunities you have to earn.' },
  { icon: ShieldCheck, title: 'Trusted Platform', desc: 'Operate securely with MTN-backed agent tools and support.' },
  { icon: Star, title: 'Agent Badge & ID', desc: 'Get verified agent status with a professional Agent ID and badge.' },
];

const steps = [
  { icon: UserPlus, title: 'Create Agent Account', desc: 'Sign up and submit your agent application in minutes.' },
  { icon: CheckCircle, title: 'Get Approved', desc: 'Our team reviews and approves your application quickly.' },
  { icon: Users, title: 'Register Customers', desc: 'Start registering customers at exclusive agent prices.' },
  { icon: DollarSign, title: 'Earn Commissions', desc: 'Make profit on every successful registration you complete.' },
];

const trustIndicators = [
  { icon: ShieldCheck, label: 'Secure Platform' },
  { icon: Phone, label: '24/7 Support' },
  { icon: Zap, label: 'Fast Processing' },
  { icon: Network, label: 'Trusted Network' },
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
            useAuthStore.getState().setUser({ ...user, role: 'agent' }, 'agent');
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
      <div className="ba-page">
        {/* ===== HERO ===== */}
        <section className="ba-hero">
          <div className="ba-hero-bg" />
          <div className="ba-hero-content">
            <div className="ba-hero-text">
              <div className="ba-hero-badge">
                <ShieldCheck size={14} />
                <span>Trusted Agent Network</span>
              </div>
              <h1 className="ba-hero-title">Become an <span className="ba-highlight">MTN AFA Agent</span></h1>
              <p className="ba-hero-sub">
                Register customers at affordable agent prices and earn commissions on every successful registration.
              </p>
              <p className="ba-hero-desc">
                Grow your business, serve more customers, and increase your earnings with MTN AFA Agent tools.
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
              <div className="ba-hero-trust">
                <ShieldCheck size={14} />
                <span>Secure</span>
                <span className="ba-dot">•</span>
                <ShieldCheck size={14} />
                <span>Reliable</span>
                <span className="ba-dot">•</span>
                <ShieldCheck size={14} />
                <span>Profitable</span>
              </div>
            </div>
            <div className="ba-hero-visual">
              <div className="ba-hero-phone">
                <div className="ba-hero-phone-screen">
                  <div className="ba-hero-phone-statusbar">
                    <span>MTN AFA</span>
                    <span className="ba-signal">●●●●</span>
                  </div>
                  <div className="ba-hero-phone-agent">
                    <div className="ba-agent-avatar">
                      <UserCheck size={32} />
                    </div>
                    <div className="ba-agent-info">
                      <strong>Agent Dashboard</strong>
                      <span>GHS 0.00 earned</span>
                    </div>
                  </div>
                  <div className="ba-hero-phone-stats">
                    <div className="ba-phone-stat">
                      <span className="ba-stat-label">Customers</span>
                      <span className="ba-stat-value">0</span>
                    </div>
                    <div className="ba-phone-stat">
                      <span className="ba-stat-label">Commission</span>
                      <span className="ba-stat-value">GHS 0</span>
                    </div>
                    <div className="ba-phone-stat">
                      <span className="ba-stat-label">Rating</span>
                      <span className="ba-stat-value">★★★★★</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

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
                    <IconEl size={24} />
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
                    <Star size={14} className="ba-agent-star" />
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
                <span className="ba-profit-value ba-profit-accent">GHS 5</span>
              </div>
              <div className="ba-profit-divider" />
              <div className="ba-profit-item">
                <span className="ba-profit-label">Estimated earnings</span>
                <span className="ba-profit-value ba-profit-highlight">GHS 500</span>
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
                    <IconEl size={28} />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  {i < steps.length - 1 && <div className="ba-step-connector"><ChevronRight size={20} /></div>}
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
                <span className="ba-cta-price-amount">GHS 100</span>
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
                {user && <span> Current balance: GHS {Number(user.wallet_balance || 0).toFixed(2)}</span>}
              </p>
            </div>
          </div>
        </section>

        {/* ===== TRUST FOOTER ===== */}
        <section className="ba-trust-footer">
          {trustIndicators.map((t) => {
            const IconEl = t.icon;
            return (
              <div key={t.label} className="ba-trust-item">
                <IconEl size={18} />
                <span>{t.label}</span>
              </div>
            );
          })}
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
  );
};

export default BecomeAgentPage;
