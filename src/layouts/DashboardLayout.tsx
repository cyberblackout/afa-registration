import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IonIcon, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import {
  gridOutline,
  grid,
  walletOutline,
  wallet,
  addCircleOutline,
  addCircle,
  cartOutline,
  cart,
  personOutline,
  person,
  notificationsOutline,
  notifications,
  giftOutline,
  gift,
  ribbonOutline,
  ribbon,
  logOutOutline,
  menuOutline,
  closeOutline,
  logoWhatsapp,
  shieldCheckmarkOutline,
  chevronForward,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebarStore } from '../store/sidebarStore';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { supabase } from '../services/supabase';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
}

interface NavItem {
  label: string;
  icon: string;
  iconFilled: string;
  path: string;
}

interface WhatsAppConfig {
  enabled: boolean;
  userNumber: string;
  agentNumber: string;
  userMessage: string;
  agentMessage: string;
}

const userNavGroups = [
  {
    label: null,
    items: [
      { label: 'Dashboard', icon: gridOutline, iconFilled: grid, path: '/dashboard' },
    ] as NavItem[],
  },
  {
    label: 'Actions',
    items: [
      { label: 'Wallet', icon: walletOutline, iconFilled: wallet, path: '/wallet' },
      { label: 'Register AFA', icon: addCircleOutline, iconFilled: addCircle, path: '/register-afa' },
      { label: 'Orders', icon: cartOutline, iconFilled: cart, path: '/orders' },
    ] as NavItem[],
  },
  {
    label: 'Account',
    items: [
      { label: 'Referrals', icon: giftOutline, iconFilled: gift, path: '/referrals' },
      { label: 'Profile', icon: personOutline, iconFilled: person, path: '/profile' },
      { label: 'Notifications', icon: notificationsOutline, iconFilled: notifications, path: '/notifications' },
    ] as NavItem[],
  },
];

const agentNavGroups = [
  {
    label: null,
    items: [
      { label: 'Agent Dashboard', icon: ribbonOutline, iconFilled: ribbon, path: '/agent/dashboard' },
    ] as NavItem[],
  },
  {
    label: 'Actions',
    items: [
      { label: 'Wallet', icon: walletOutline, iconFilled: wallet, path: '/wallet' },
      { label: 'Register AFA', icon: addCircleOutline, iconFilled: addCircle, path: '/register-afa' },
      { label: 'Orders', icon: cartOutline, iconFilled: cart, path: '/orders' },
    ] as NavItem[],
  },
  {
    label: 'Account',
    items: [
      { label: 'Referrals', icon: giftOutline, iconFilled: gift, path: '/referrals' },
      { label: 'Profile', icon: personOutline, iconFilled: person, path: '/profile' },
      { label: 'Notifications', icon: notificationsOutline, iconFilled: notifications, path: '/notifications' },
    ] as NavItem[],
  },
];

const sidebarVariants = {
  open: { x: 0, transition: { type: 'spring' as const, damping: 26, stiffness: 200 } },
  closed: { x: '-100%', transition: { type: 'spring' as const, damping: 26, stiffness: 200 } },
};

const overlayVariants = {
  open: { opacity: 1, transition: { duration: 0.2 } },
  closed: { opacity: 0, transition: { duration: 0.2 } },
};

const defaultConfig: WhatsAppConfig = {
  enabled: true,
  userNumber: '',
  agentNumber: '',
  userMessage: 'Hello, I need help with my account.',
  agentMessage: 'Hello, I am an agent and I need assistance.',
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onRefresh }) => {
  const location = useLocation();
  const { isOpen, toggle, close } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const activePath = location.pathname;

  const role = user?.role ?? 'user';
  const navGroups = role === 'agent' ? agentNavGroups : userNavGroups;

  const [wa, setWa] = useState<WhatsAppConfig>(defaultConfig);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { adminConfigApi } = await import('../services/api');
        const data = await adminConfigApi.getSystemSettings();
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.setting_name] = s.setting_value; });
        setWa({
          enabled: map['whatsapp_enabled'] !== 'false',
          userNumber: (map['whatsapp_user_number'] || '').replace(/[^0-9]/g, ''),
          agentNumber: (map['whatsapp_agent_number'] || '').replace(/[^0-9]/g, ''),
          userMessage: map['whatsapp_user_message'] || defaultConfig.userMessage,
          agentMessage: map['whatsapp_agent_message'] || defaultConfig.agentMessage,
        });
      } catch (e) {
        // Non-critical
      }
    };
    fetchConfig();
  }, []);

  const userWaLink = wa.userNumber
    ? `https://wa.me/${wa.userNumber}?text=${encodeURIComponent(wa.userMessage)}`
    : '#';

  const agentWaLink = wa.agentNumber
    ? `https://wa.me/${wa.agentNumber}?text=${encodeURIComponent(wa.agentMessage)}`
    : '#';

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    logout();
    window.location.replace('/login');
  }, [logout]);

  const waLinkForFloat = role === 'agent' ? agentWaLink : userWaLink;
  const waNumberForFloat = role === 'agent' ? wa.agentNumber : wa.userNumber;

  const isAgent = role === 'agent';

  const sidebarContent = (
    <>
      <div className="sb-header">
        <div className="sb-brand">
          <div className="sb-logo">
            <img src="/favicon.png" alt="MTN" className="sb-logo-img" />
          </div>
          <div className="sb-brand-text">
            <span className="sb-brand-name">MTN AFA</span>
            <span className="sb-brand-role">{isAgent ? 'Agent Account' : 'User Account'}</span>
          </div>
          <div className="sb-brand-signal">
            <div className="sb-signal-dot sb-signal-dot--1"></div>
            <div className="sb-signal-dot sb-signal-dot--2"></div>
            <div className="sb-signal-dot sb-signal-dot--3"></div>
          </div>
        </div>
      </div>

      <nav className="sb-nav">
        {navGroups.map((group, gi) => (
          <div key={gi} className={`sb-nav-group ${gi > 0 ? 'sb-nav-group--spaced' : ''}`}>
            {group.label && (
              <span className="sb-nav-group-label">{group.label}</span>
            )}
            {group.items.map((item) => {
              const isActive = activePath === item.path;
              const hasBadge = item.path === '/notifications' && unreadCount > 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sb-nav-item ${isActive ? 'sb-nav-item--active' : ''}`}
                  onClick={close}
                >
                  <span className="sb-nav-icon">
                    <IonIcon icon={isActive ? item.iconFilled : item.icon} />
                  </span>
                  <span className="sb-nav-label">{item.label}</span>
                  {hasBadge && <span className="sb-nav-badge">{unreadCount}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-footer-area">
        <Link
          to="/become-agent"
          className="sb-promo-card sb-promo-card--agent"
          onClick={close}
        >
          <div className="sb-promo-icon">
            <IonIcon icon={shieldCheckmarkOutline} />
          </div>
          <div className="sb-promo-text">
            <span className="sb-promo-title">Become an Agent</span>
            <span className="sb-promo-desc">Start earning with MTN AFA</span>
          </div>
          <IonIcon icon={chevronForward} className="sb-promo-arrow" />
        </Link>

        {wa.enabled && (isAgent ? wa.agentNumber : wa.userNumber) && (
          <a
            href={isAgent ? agentWaLink : userWaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="sb-promo-link"
            onClick={close}
          >
            <span className="sb-promo-link-icon">
              <IonIcon icon={logoWhatsapp} />
            </span>
            <span className="sb-promo-link-label">WhatsApp Support</span>
          </a>
        )}

        <div className="sb-logout-area">
          <button className="sb-logout-btn" onClick={handleLogout}>
            <IonIcon icon={logOutOutline} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <nav className="dashboard-navbar">
        <div className="navbar-left">
          <Link to="/notifications" className="notification-btn" aria-label="Notifications">
            <IonIcon icon={notificationsOutline} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </Link>
        </div>
        <div className="navbar-brand">
          <img src="/favicon.png" alt="MTN" className="navbar-logo" />
          <span>{isAgent ? 'MTN AFA AGENT' : 'MTN AFA PORTAL'}</span>
        </div>
        <div className="navbar-right">
          <button className="hamburger-btn" onClick={toggle} aria-label="Toggle menu">
            <IonIcon icon={isOpen ? closeOutline : menuOutline} />
          </button>
        </div>
      </nav>

      <aside className="dashboard-sidebar">{sidebarContent}</aside>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="sidebar-overlay"
            variants={overlayVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={close}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            className="sidebar-mobile-drawer"
            variants={sidebarVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      <IonContent className="main-content">
        <IonRefresher slot="fixed" onIonRefresh={async (e) => {
          try { if (onRefresh) await onRefresh(); } finally { (e.target as any).complete(); }
        }}>
          <IonRefresherContent />
        </IonRefresher>
        {children}
      </IonContent>

      {wa.enabled && waNumberForFloat && (
        <a href={waLinkForFloat} target="_blank" rel="noopener noreferrer" className="whatsapp-float" title="WhatsApp Support">
          <IonIcon icon={logoWhatsapp} />
        </a>
      )}
    </>
  );
};

export default DashboardLayout;
