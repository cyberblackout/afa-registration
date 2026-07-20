import React from 'react';
import { IonIcon } from '@ionic/react';
import {
  shieldCheckmarkOutline,
  flashOutline,
  giftOutline,
  headsetOutline,
  addCircleOutline,
  personAddOutline,
  ribbonOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import './MTNAFABanner.css';

interface MTNAFABannerProps {
  userName: string;
  role: 'user' | 'agent';
  newRegistrationHref: string;
  secondaryActionHref: string;
}

const features = [
  { icon: shieldCheckmarkOutline, title: 'Secure', subtitle: 'Transactions' },
  { icon: flashOutline, title: 'Fast &', subtitle: 'Reliable' },
  { icon: giftOutline, title: 'Exciting', subtitle: 'Rewards' },
  { icon: headsetOutline, title: '24/7', subtitle: 'Support' },
];

const containerVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' },
  }),
};

const MTNAFABanner: React.FC<MTNAFABannerProps> = ({
  userName,
  role,
  newRegistrationHref,
  secondaryActionHref,
}) => {
  const isAgent = role === 'agent';

  return (
    <motion.div
      className="mtn-banner"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="mtn-banner-grid">
        <div className="mtn-banner-left">
          <motion.div className="mtn-greeting" custom={0} variants={itemVariants} initial="hidden" animate="visible">
            <h1 className="mtn-greeting-text">
              Hello, {userName} <span className="mtn-wave">👋</span>
            </h1>
            <p className="mtn-greeting-sub">
              {isAgent
                ? 'Welcome back, Agent. Manage your MTN AFA services efficiently.'
                : 'Welcome back to your MTN AFA Portal'}
            </p>
          </motion.div>

          <motion.div className="mtn-features" custom={1} variants={itemVariants} initial="hidden" animate="visible">
            {features.map((f, i) => (
              <React.Fragment key={f.title}>
                {i > 0 && <div className="mtn-feature-divider" />}
                <div className="mtn-feature-item">
                  <div className="mtn-feature-icon-wrap">
                    <IonIcon icon={f.icon} className="mtn-feature-icon" />
                  </div>
                  <div className="mtn-feature-text">
                    <span className="mtn-feature-title">{f.title}</span>
                    <span className="mtn-feature-sub">{f.subtitle}</span>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </motion.div>

          <motion.div className="mtn-actions" custom={2} variants={itemVariants} initial="hidden" animate="visible">
            <a href={newRegistrationHref} className="mtn-btn-primary">
              <IonIcon icon={addCircleOutline} />
              <span>New Registration</span>
            </a>
            <a href={secondaryActionHref} className="mtn-btn-secondary">
              <IonIcon icon={isAgent ? ribbonOutline : personAddOutline} />
              <span>{isAgent ? 'Agent Center' : 'Become an Agent'}</span>
            </a>
          </motion.div>
        </div>

        <div className="mtn-banner-right">
          <motion.div
            className="mtn-phone-wrapper"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
          >
            <div className="mtn-phone-mockup">
              <div className="mtn-phone-notch" />
              <div className="mtn-phone-screen">
                <div className="mtn-phone-logo">
                  <div className="mtn-logo-circle">
                    <span className="mtn-logo-text">MTN</span>
                  </div>
                </div>
                <div className="mtn-phone-balance">
                  <span className="mtn-balance-label">Balance</span>
                  <span className="mtn-balance-value">GH₵ 0.00</span>
                </div>
                <div className="mtn-phone-dots">
                  <span className="mtn-dot" />
                  <span className="mtn-dot" />
                  <span className="mtn-dot" />
                </div>
              </div>
            </div>

            <div className="mtn-float-icon mtn-float-sim">
              <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                <rect x="1" y="1" width="26" height="18" rx="3" fill="#FFCB05" stroke="#e6b800" strokeWidth="1.5" />
                <rect x="6" y="5" width="16" height="10" rx="1" fill="#e6b800" />
                <circle cx="14" cy="10" r="3" fill="#1a1a2e" />
              </svg>
            </div>

            <div className="mtn-float-icon mtn-float-coin">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" fill="#FFCB05" stroke="#e6b800" strokeWidth="1.5" />
                <text x="16" y="21" textAnchor="middle" fill="#1a1a2e" fontSize="16" fontWeight="700">₵</text>
              </svg>
            </div>

            <div className="mtn-float-icon mtn-float-coin2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#FFCB05" stroke="#e6b800" strokeWidth="1.5" opacity="0.7" />
                <text x="12" y="16.5" textAnchor="middle" fill="#1a1a2e" fontSize="12" fontWeight="700">₵</text>
              </svg>
            </div>

            <div className="mtn-wave-1" />
            <div className="mtn-wave-2" />
            <div className="mtn-glow-1" />
            <div className="mtn-glow-2" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default MTNAFABanner;
