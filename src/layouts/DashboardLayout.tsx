import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import {
  gridOutline,
  walletOutline,
  addCircleOutline,
  cartOutline,
  personOutline,
  notificationsOutline,
  giftOutline,
  ribbonOutline,
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
}

interface MenuItem {
  label: string;
  icon: string;
  path: string;
  card?: boolean;
  desc?: string;
}

interface WhatsAppConfig {
  enabled: boolean;
  userNumber: string;
  agentNumber: string;
  userMessage: string;
  agentMessage: string;
}

const sharedMenuItems: MenuItem[] = [
  { label: 'Wallet', icon: walletOutline, path: '/wallet' },
  { label: 'Register AFA', icon: addCircleOutline, path: '/register-afa' },
  { label: 'Orders', icon: cartOutline, path: '/orders' },
  { label: 'Referrals', icon: giftOutline, path: '/referrals' },
  { label: 'Profile', icon: personOutline, path: '/profile' },
  { label: 'Notifications', icon: notificationsOutline, path: '/notifications' },
];

const userMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: gridOutline, path: '/dashboard' },
  ...sharedMenuItems,
  { label: 'Become an Agent', icon: shieldCheckmarkOutline, path: '/become-agent', card: true, desc: 'Start earning with MTN AFA' },
];

const agentMenuItems: MenuItem[] = [
  { label: 'Agent Dashboard', icon: ribbonOutline, path: '/agent/dashboard' },
  ...sharedMenuItems,
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

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { isOpen, toggle, close } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const activePath = location.pathname;

  const role = user?.role ?? 'user';
  const mainMenuItems = role === 'agent' ? agentMenuItems : userMenuItems;

  const [wa, setWa] = useState<WhatsAppConfig>(defaultConfig);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase.from('system_settings').select('setting_name, setting_value');
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
          <div className="sb-logo-circle">
            <img src="/favicon.png" alt="MTN" className="sb-logo-img" />
          </div>
          <div className="sb-brand-text">
            <span className="sb-brand-name">{isAgent ? 'MTN AFA Agent' : 'MTN AFA Portal'}</span>
            <span className="sb-brand-role">{isAgent ? 'Agent Account' : 'User Account'}</span>
          </div>
        </div>
      </div>

      <nav className="sb-nav">
        {mainMenuItems.filter(item => !item.card).map((item) => {
          const isActive = activePath === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sb-nav-item ${isActive ? 'active' : ''}`}
              onClick={close}
            >
              <span className="sb-nav-icon">
                <IonIcon icon={item.icon} />
              </span>
              <span className="sb-nav-label">{item.label}</span>
              {isActive && <span className="sb-nav-indicator" />}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {mainMenuItems.filter(item => item.card).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="sb-nav-card"
            onClick={close}
          >
            <div className="sb-nav-card-icon">
              <IonIcon icon={item.icon} />
            </div>
            <div className="sb-nav-card-text">
              <span className="sb-nav-card-title">{item.label}</span>
              <span className="sb-nav-card-desc">{item.desc}</span>
            </div>
            <div className="sb-nav-card-btn">
              <IonIcon icon={chevronForward} />
            </div>
          </Link>
        ))}

        {wa.enabled && (
          <div className="sb-support">
            <a
              href={isAgent ? agentWaLink : userWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="sb-support-card"
              onClick={close}
            >
              <div className="sb-support-icon">
                <IonIcon icon={logoWhatsapp} />
              </div>
              <div className="sb-support-text">
                <span className="sb-support-title">WhatsApp Support</span>
                <span className="sb-support-desc">Chat with support</span>
              </div>
            </a>
          </div>
        )}

        <div className="sb-footer">
          <button className="sb-logout-btn" onClick={handleLogout}>
            <IonIcon icon={logOutOutline} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="dashboard-layout">
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

      <main className="main-content">{children}</main>

      {wa.enabled && waNumberForFloat && (
        <a href={waLinkForFloat} target="_blank" rel="noopener noreferrer" className="whatsapp-float" title="WhatsApp Support">
          <IonIcon icon={logoWhatsapp} />
        </a>
      )}
    </div>
  );
};

export default DashboardLayout;
