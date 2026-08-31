import React, { useEffect, useState } from 'react';
import { Link, useLocation, useHistory } from 'react-router-dom';
import { IonIcon, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  gridOutline,
  peopleOutline,
  documentTextOutline,
  walletOutline,
  cardOutline,
  cartOutline,
  chatbubblesOutline,
  notificationsOutline,
  barChartOutline,
  settingsOutline,
  logOutOutline,
  menuOutline,
  closeOutline,
  giftOutline,
  ribbonOutline,
  logoWhatsapp,
  sunnyOutline,
  moonOutline,
} from 'ionicons/icons';
import { useSidebarStore } from '../store/sidebarStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { supabase } from '../services/supabase';
import './AdminLayout.css';

interface AdminLayoutProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
}

const menuItems = [
  { label: 'Dashboard', icon: gridOutline, path: '/cyberin/dashboard' },
  { label: 'Registrations', icon: documentTextOutline, path: '/cyberin/registrations' },
  { label: 'Customers', icon: peopleOutline, path: '/cyberin/customers' },
  { label: 'Wallet', icon: walletOutline, path: '/cyberin/wallet' },
  { label: 'Payments', icon: cardOutline, path: '/cyberin/payments' },
  { label: 'Orders', icon: cartOutline, path: '/cyberin/orders' },
  { label: 'Notifications', icon: notificationsOutline, path: '/cyberin/notifications' },
  { label: 'Referrals', icon: giftOutline, path: '/cyberin/referrals' },
  { label: 'Agents', icon: ribbonOutline, path: '/cyberin/agents' },
  { label: 'Reports', icon: barChartOutline, path: '/cyberin/reports' },
  { label: 'Settings', icon: settingsOutline, path: '/cyberin/settings' },
];

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, onRefresh }) => {
  const location = useLocation();
  const history = useHistory();
  const queryClient = useQueryClient();
  const { isOpen, toggle, close } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const activePath = location.pathname;

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappMessage, setWhatsappMessage] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { adminConfigApi } = await import('../services/api');
        const data = await adminConfigApi.getSystemSettings();
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.setting_name] = s.setting_value; });
        const enabled = map['whatsapp_enabled'] !== 'false';
        const number = (map['whatsapp_user_number'] || '').replace(/[^0-9]/g, '');
        const message = map['whatsapp_user_message'] || 'Hello, I need help with my account.';
        setWhatsappEnabled(enabled);
        setWhatsappNumber(number);
        setWhatsappMessage(message);
      } catch (e) {
        // Non-critical
      }
    };
    fetchConfig();
  }, []);

  const waLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : '#';

  const handleLogout = async () => {
    localStorage.removeItem('remember_me');
    queryClient.clear();
    await supabase.auth.signOut();
    logout();
    history.push('/login');
  };

  return (
    <>
      <nav className="admin-navbar">
        <div className="admin-navbar-left">
          <button className="admin-hamburger" onClick={toggle}>
            <IonIcon icon={isOpen ? closeOutline : menuOutline} />
          </button>
          <div className="admin-brand">
            <img src="/favicon.png" alt="MTN" className="admin-brand-logo" />
            <span>MTN AFA Admin</span>
          </div>
        </div>
        <div className="admin-navbar-right">
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <IonIcon icon={isDark ? moonOutline : sunnyOutline} />
          </button>
          <span className="admin-user-name">{user?.full_name || 'Admin'}</span>
          <div className="admin-avatar">{user?.full_name?.charAt(0) || 'A'}</div>
        </div>
      </nav>

      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <img src="/favicon.png" alt="MTN" className="admin-brand-logo" />
          <span>MTN AFA Admin</span>
        </div>
        <div className="admin-sidebar-menu">
          {menuItems.map((item) => {
            const isActive = activePath === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`admin-menu-item ${isActive ? 'active' : ''}`}
              >
                <IonIcon icon={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="admin-sidebar-footer">
          <button className="admin-menu-item logout" onClick={handleLogout}>
            <IonIcon icon={logOutOutline} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div
        className={`admin-overlay ${isOpen ? 'admin-overlay--open' : ''}`}
        onClick={close}
      />

      <aside className={`admin-mobile-drawer ${isOpen ? 'admin-mobile-drawer--open' : ''}`}>
        <div className="admin-sidebar-header">
          <span>MTN AFA Admin</span>
        </div>
        <div className="admin-sidebar-menu">
          {menuItems.map((item) => (
            <Link key={item.path} to={item.path} className="admin-menu-item" onClick={close}>
              <IonIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="admin-sidebar-footer">
          <button className="admin-menu-item logout" onClick={handleLogout}>
            <IonIcon icon={logOutOutline} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <IonContent className="admin-main">
        <IonRefresher slot="fixed" onIonRefresh={async (e) => {
          try { if (onRefresh) await onRefresh(); } finally { (e.target as any).complete(); }
        }}>
          <IonRefresherContent />
        </IonRefresher>
        {children}
      </IonContent>

      {whatsappEnabled && whatsappNumber && (
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="whatsapp-float" title="WhatsApp Support">
          <IonIcon icon={logoWhatsapp} />
        </a>
      )}
    </>
  );
};

export default AdminLayout;
