import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useHistory } from 'react-router-dom';
import { IonIcon, IonContent, IonRefresher, IonRefresherContent } from '@ionic/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  gridOutline,
  peopleOutline,
  documentTextOutline,
  walletOutline,
  cardOutline,
  cartOutline,
  notificationsOutline,
  barChartOutline,
  settingsOutline,
  logOutOutline,
  closeOutline,
  giftOutline,
  ribbonOutline,
  sunnyOutline,
  moonOutline,
  ellipsisHorizontal,
  addOutline,
  checkmarkDoneOutline,
  chatbubblesOutline,
  downloadOutline,
  wifiOutline,
  cloudOfflineOutline,
  timeOutline,
} from 'ionicons/icons';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { adminDashboardApi, notificationApi } from '../services/api';
import { supabase } from '../services/supabase';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { NotificationHub } from '../components/NotificationHub';
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
  { label: 'Activity', icon: timeOutline, path: '/cyberin/audit' },
  { label: 'Settings', icon: settingsOutline, path: '/cyberin/settings' },
];

const FINANCE_PATHS = ['/cyberin/payments', '/cyberin/wallet', '/cyberin/orders'];
const MORE_PATHS = [
  '/cyberin/customers',
  '/cyberin/notifications',
  '/cyberin/referrals',
  '/cyberin/agents',
  '/cyberin/reports',
  '/cyberin/audit',
  '/cyberin/settings',
];

const moreSheetItems = [
  { label: 'Customers', icon: peopleOutline, path: '/cyberin/customers' },
  { label: 'Wallet', icon: walletOutline, path: '/cyberin/wallet' },
  { label: 'Orders', icon: cartOutline, path: '/cyberin/orders' },
  { label: 'Notifications', icon: notificationsOutline, path: '/cyberin/notifications' },
  { label: 'Referrals', icon: giftOutline, path: '/cyberin/referrals' },
  { label: 'Agents', icon: ribbonOutline, path: '/cyberin/agents' },
  { label: 'Reports', icon: barChartOutline, path: '/cyberin/reports' },
  { label: 'Activity', icon: timeOutline, path: '/cyberin/audit' },
  { label: 'Settings', icon: settingsOutline, path: '/cyberin/settings' },
];

const speedDialActions = [
  { label: 'Approve queue', icon: checkmarkDoneOutline, path: '/cyberin/registrations' },
  { label: 'Customers', icon: peopleOutline, path: '/cyberin/customers' },
  { label: 'Broadcast', icon: chatbubblesOutline, path: '/cyberin/notifications' },
  { label: 'Export report', icon: downloadOutline, path: '/cyberin/reports' },
];

const haptic = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration unsupported — non-critical */
  }
};

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, onRefresh }) => {
  const location = useLocation();
  const history = useHistory();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const activePath = location.pathname;

  const contentRef = useRef<HTMLIonContentElement>(null);
  const logoutRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [dialOpen, setDialOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const {
    pendingCount: queuedCount,
    isOnline,
    isSyncing,
    flush,
  } = useOfflineQueue();

  // Every admin page shares this single scroll container. Reset it on each
  // navigation so no page can inherit a stuck/scrolled state from another
  // page (or from a dismissed overlay) via route transitions.
  useEffect(() => {
    contentRef.current?.scrollToTop(0);
    setDialOpen(false);
    setMoreOpen(false);
    setHubOpen(false);
  }, [location.pathname]);

  // Shift the fixed navbar/content when the offline banner is showing.
  const bannerVisible = !isOnline || queuedCount > 0;
  useEffect(() => {
    document.documentElement.classList.toggle('admin-banner-open', bannerVisible);
    return () => document.documentElement.classList.remove('admin-banner-open');
  }, [bannerVisible]);

  // Shares the React Query cache with DashboardPage (same key) — no extra
  // network round-trip once the dashboard has loaded.
  const { data: stats } = useQuery({
    queryKey: ['admin_dashboard'],
    queryFn: () => adminDashboardApi.getStats(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: unread } = useQuery({
    queryKey: ['admin_unread_count'],
    queryFn: () => notificationApi.unreadCount(),
    refetchInterval: 60_000,
  });

  const pendingCount = stats?.pending_registrations ?? 0;
  const unreadCount = unread?.count ?? 0;

  const handleLogout = async () => {
    if (logoutRef.current) return;
    logoutRef.current = true;
    setLoggingOut(true);
    localStorage.removeItem('remember_me');
    queryClient.clear();
    try {
      await supabase.auth.signOut();
    } catch {
      // signOut failed outright (e.g. offline) — complete the logout UX anyway
    } finally {
      logout();
      history.push('/login');
    }
  };

  const toggleDial = () => {
    haptic(8);
    setDialOpen((v) => !v);
  };

  const isHome = activePath === '/cyberin/dashboard';
  const isRegs = activePath === '/cyberin/registrations';
  const isFinance = FINANCE_PATHS.includes(activePath);
  const isMore = moreOpen || MORE_PATHS.includes(activePath);

  return (
    <>
      {bannerVisible && (
        <div className="admin-offline-banner" role="status" aria-live="polite">
          <IonIcon icon={isOnline ? wifiOutline : cloudOfflineOutline} />
          <span>
            {!isOnline
              ? queuedCount > 0
                ? `Offline — ${queuedCount} action${queuedCount === 1 ? '' : 's'} queued`
                : 'Offline — showing cached data'
              : `${queuedCount} action${queuedCount === 1 ? '' : 's'} waiting to sync`}
          </span>
          {isOnline && queuedCount > 0 && (
            <button type="button" className="admin-banner-sync" onClick={() => void flush()} disabled={isSyncing}>
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      )}
      <nav className="admin-navbar">
        <div className="admin-navbar-left">
          <div className="admin-brand">
            <img src="/favicon.png" alt="MTN" className="admin-brand-logo" />
            <span>MTN AFA Admin</span>
          </div>
        </div>
        <div className="admin-navbar-right">
          <button
            type="button"
            className="admin-bell"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-haspopup="dialog"
            aria-expanded={hubOpen}
            onClick={() => { haptic(8); setHubOpen(true); }}
          >
            <IonIcon icon={notificationsOutline} />
            {unreadCount > 0 && (
              <span className="admin-bell-badge m3-numeric">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <IonIcon icon={isDark ? moonOutline : sunnyOutline} />
          </button>
          <span className="admin-user-name">{user?.full_name || 'Admin'}</span>
          <Link
            to="/cyberin/settings"
            className="admin-settings-btn"
            aria-label="Settings"
            title="Settings"
            onClick={() => haptic(8)}
          >
            <IonIcon icon={settingsOutline} />
          </Link>
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
          <button className="admin-menu-item logout" onClick={handleLogout} disabled={loggingOut}>
            <IonIcon icon={logOutOutline} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <IonContent ref={contentRef} scrollY={true} className="admin-main">
        <IonRefresher slot="fixed" onIonRefresh={async (e) => {
          try { if (onRefresh) await onRefresh(); } finally { (e.target as HTMLIonRefresherElement)?.complete(); }
        }}>
          <IonRefresherContent />
        </IonRefresher>
        {children}
      </IonContent>

      {/* ===== Mobile: M3 bottom nav + speed-dial FAB + More sheet =====
           Portaled straight to <body>. .ion-page carries
           `contain: layout size style` (Ionic core), which hijacks
           position:fixed for everything inside it — the bar drifts with
           the page while scrolling. <body> is a static top-level box
           (Ionic pins it with position:fixed + translateZ(0)), so this
           cluster is mathematically locked to the viewport bottom. */}
      {createPortal(
        <>
          <nav className="m3-bottom-nav" aria-label="Primary">
            <Link
              to="/cyberin/dashboard"
              className={`m3-nav-item ${isHome ? 'active' : ''}`}
              aria-current={isHome ? 'page' : undefined}
            >
              <span className="m3-nav-indicator" aria-hidden="true" />
              <span className="m3-nav-icon-wrap">
                <IonIcon icon={gridOutline} />
              </span>
              <span className="m3-nav-label">Home</span>
            </Link>

            <Link
              to="/cyberin/registrations"
              className={`m3-nav-item ${isRegs ? 'active' : ''}`}
              aria-current={isRegs ? 'page' : undefined}
            >
              <span className="m3-nav-indicator" aria-hidden="true" />
              <span className="m3-nav-icon-wrap">
                <IonIcon icon={documentTextOutline} />
                {pendingCount > 0 && (
                  <span className="m3-nav-badge m3-numeric">{pendingCount > 99 ? '99+' : pendingCount}</span>
                )}
              </span>
              <span className="m3-nav-label">Regs</span>
            </Link>

            <div className="m3-fab-slot">
              <button
                className={`m3-fab ${dialOpen ? 'm3-fab--open' : ''}`}
                onClick={toggleDial}
                aria-expanded={dialOpen}
                aria-label={dialOpen ? 'Close quick actions' : 'Open quick actions'}
              >
                <IonIcon icon={dialOpen ? closeOutline : addOutline} />
              </button>
            </div>

            <Link
              to="/cyberin/payments"
              className={`m3-nav-item ${isFinance ? 'active' : ''}`}
              aria-current={isFinance ? 'page' : undefined}
            >
              <span className="m3-nav-indicator" aria-hidden="true" />
              <span className="m3-nav-icon-wrap">
                <IonIcon icon={cardOutline} />
              </span>
              <span className="m3-nav-label">Finance</span>
            </Link>

            <button
              className={`m3-nav-item ${isMore ? 'active' : ''}`}
              onClick={() => { haptic(8); setMoreOpen(true); }}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <span className="m3-nav-indicator" aria-hidden="true" />
              <span className="m3-nav-icon-wrap">
                <IonIcon icon={ellipsisHorizontal} />
              </span>
              <span className="m3-nav-label">More</span>
            </button>
          </nav>

          {dialOpen && (
            <div className="m3-dial-scrim" onClick={() => setDialOpen(false)} aria-hidden="true" />
          )}
          <div className={`m3-speed-dial ${dialOpen ? 'm3-speed-dial--open' : ''}`} role="menu" aria-hidden={!dialOpen}>
            {speedDialActions.map((action, i) => (
              <Link
                key={action.path}
                to={action.path}
                role="menuitem"
                tabIndex={dialOpen ? 0 : -1}
                className="m3-speed-dial-item"
                style={{ transitionDelay: dialOpen ? `${i * 40}ms` : '0ms' }}
                onClick={() => { haptic(6); setDialOpen(false); }}
              >
                <span className="m3-speed-dial-label">{action.label}</span>
                <span className="m3-speed-dial-mini">
                  <IonIcon icon={action.icon} />
                </span>
              </Link>
            ))}
          </div>

          {/* ===== Mobile: "More" bottom sheet ===== */}
          {moreOpen && (
            <>
              <div className="m3-sheet-scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
              <div className="m3-more-sheet" role="dialog" aria-label="More destinations" aria-modal="true">
                <div className="m3-sheet-handle" aria-hidden="true" />
                <div className="m3-more-grid">
                  {moreSheetItems.map((item) => (
                    <Link key={item.path} to={item.path} className="m3-more-tile" onClick={() => setMoreOpen(false)}>
                      <span className="m3-more-tile-icon">
                        <IonIcon icon={item.icon} />
                      </span>
                      <span className="m3-more-tile-label">{item.label}</span>
                    </Link>
                  ))}
                </div>
                <button className="m3-more-logout" onClick={handleLogout} disabled={loggingOut}>
                  <IonIcon icon={logOutOutline} />
                  <span>{loggingOut ? 'Signing out…' : 'Logout'}</span>
                </button>
              </div>
            </>
          )}
        </>,
        document.body
      )}

      <NotificationHub open={hubOpen} onClose={() => setHubOpen(false)} />
    </>
  );
};

export default AdminLayout;
