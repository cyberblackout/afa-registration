import React, { useEffect, useState } from 'react';
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
  flashOutline,
  logOutOutline,
  menuOutline,
  closeOutline,
  logoWhatsapp,
  personAddOutline,
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
}

interface WhatsAppConfig {
  enabled: boolean;
  userNumber: string;
  agentNumber: string;
  userMessage: string;
  agentMessage: string;
}

const baseMenuItems: MenuItem[] = [
  { label: 'Dashboard', icon: gridOutline, path: '/dashboard' },
  { label: 'Wallet', icon: walletOutline, path: '/wallet' },
  { label: 'Register AFA', icon: addCircleOutline, path: '/register-afa' },
  { label: 'Orders', icon: cartOutline, path: '/orders' },
  { label: 'Referrals', icon: giftOutline, path: '/referrals' },
  { label: 'Profile', icon: personOutline, path: '/profile' },
  { label: 'Notifications', icon: notificationsOutline, path: '/notifications' },
];

const agentMenuItems: MenuItem[] = [
  { label: 'Agent Dashboard', icon: ribbonOutline, path: '/agent/dashboard' },
  { label: 'Agent Pricing', icon: flashOutline, path: '/agent/pricing' },
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

  const isAgent = user?.role === 'agent';
  const role = user?.role ?? 'user';
  const becomeAgentItem: MenuItem = { label: 'Become an Agent', icon: personAddOutline, path: '/become-agent' };
  const menuItems = isAgent
    ? [...baseMenuItems, ...agentMenuItems]
    : [...baseMenuItems.slice(0, 5), becomeAgentItem, ...baseMenuItems.slice(5)];

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
    window.location.replace('/login');
  };

  const renderMenuItems = () =>
    menuItems.map((item) => {
      const isActive = activePath === item.path;
      return (
        <Link
          key={item.path}
          to={item.path}
          className={`menu-item ${isActive ? 'active' : ''}`}
          onClick={close}
        >
          <IonIcon icon={item.icon} className="menu-icon" />
          <span>{item.label}</span>
        </Link>
      );
    });

  const renderWhatsAppItem = () => {
    if (!wa.enabled) return null;
    if (role === 'agent') {
      return (
        <a
          key="agent-whatsapp"
          href={agentWaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="menu-item agent-whatsapp-link"
          onClick={close}
          title="Contact Agent Support via WhatsApp"
        >
          <IonIcon icon={logoWhatsapp} className="menu-icon" />
          <span>Agent WhatsApp Support</span>
        </a>
      );
    }
    return (
      <a
        key="user-whatsapp"
        href={userWaLink}
        target="_blank"
        rel="noopener noreferrer"
        className="menu-item whatsapp-link"
        onClick={close}
        title="Contact Support via WhatsApp"
      >
        <IonIcon icon={logoWhatsapp} className="menu-icon" />
        <span>WhatsApp Support</span>
      </a>
    );
  };

  const renderLogoutButton = () => (
    <button className="menu-item logout-btn" onClick={handleLogout}>
      <IonIcon icon={logOutOutline} className="menu-icon" />
      <span>Logout</span>
    </button>
  );

  const waLinkForFloat = role === 'agent' ? agentWaLink : userWaLink;
  const waNumberForFloat = role === 'agent' ? wa.agentNumber : wa.userNumber;

  const sidebarContent = (
    <>
      <div className="sidebar-header">
        <span className="sidebar-brand">MTN AFA Portal</span>
      </div>
      <div className="sidebar-menu">
        {renderMenuItems()}
        {renderWhatsAppItem()}
        {renderLogoutButton()}
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
        <span className="navbar-brand">MTN AFA PORTAL</span>
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
