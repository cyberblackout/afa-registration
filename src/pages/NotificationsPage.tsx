import React, { useState, useMemo, useCallback } from 'react';
import {
  IonPage,
  IonIcon,
  IonToast,
} from '@ionic/react';
import {
  informationCircleOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  closeCircleOutline,
  notificationsOutline,
  checkmarkDoneOutline,
  trashOutline,
  timeOutline,
  notificationsCircleOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { notificationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Notification } from '../types';
import DashboardLayout from '../layouts/DashboardLayout';
import { formatGhanaTimeAgo, getGhanaDateLabel } from '../utils/date';
import './NotificationsPage.css';

const typeIcons: Record<string, string> = {
  info: informationCircleOutline,
  success: checkmarkCircleOutline,
  warning: alertCircleOutline,
  error: closeCircleOutline,
};

function getTimeAgo(dateStr: string): string {
  return formatGhanaTimeAgo(dateStr);
}

function getDateLabel(dateStr: string): string {
  return getGhanaDateLabel(dateStr);
}

function groupByDateCategory(notifications: Notification[]): Map<string, Notification[]> {
  const groups = new Map<string, Notification[]>();
  const order = ['Today', 'Yesterday', 'This Week', 'Older'];
  order.forEach((label) => groups.set(label, []));

  notifications.forEach((n) => {
    const label = getDateLabel(n.created_at);
    const group = groups.get(label);
    if (group) group.push(n);
  });

  order.forEach((label) => {
    if (groups.get(label)?.length === 0) groups.delete(label);
  });

  return groups;
}

const itemVariants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.03, duration: 0.25 },
  }),
  exit: { opacity: 0, x: 40, transition: { duration: 0.2 } },
};

function SkeletonRow() {
  return (
    <div className="nf-skeleton-row">
      <div className="nf-skel-icon" />
      <div className="nf-skel-content">
        <div className="nf-skel-line nf-skel-line--title" />
        <div className="nf-skel-line nf-skel-line--text" />
      </div>
    </div>
  );
}

const NotificationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const showToastMessage = useCallback((msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  }, []);

  const { data: notifications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => notificationApi.list() as Promise<Notification[]>,
    enabled: !!user?.id,
  });

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'read') return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const groupedNotifications = useMemo(() => groupByDateCategory(filteredNotifications), [filteredNotifications]);
  const categoryKeys = useMemo(() => Array.from(groupedNotifications.keys()), [groupedNotifications]);

  React.useEffect(() => {
    const channel = supabase
      .channel('notifications-live')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToastMessage('All notifications marked as read');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToastMessage('Notification removed');
    },
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const readCount = useMemo(() => notifications.filter((n) => n.read).length, [notifications]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.read) {
      markReadMutation.mutate(notification.id);
    }
  }, [markReadMutation]);

  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <motion.div
          className="nf-page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        >
          {/* ── HEADER ── */}
          <div className="nf-header">
            <div className="nf-header-left">
              <div className="nf-header-icon">
                <IonIcon icon={notificationsCircleOutline} />
              </div>
              <div className="nf-header-text">
                <h1>Notifications</h1>
                <p>Stay updated on your AFA account and activities</p>
              </div>
            </div>
          </div>

          {/* ── SUMMARY BAR ── */}
          {!isLoading && !isError && notifications.length > 0 && (
            <div className="nf-summary">
              <div className="nf-summary-info">
                <span className="nf-summary-count">
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </span>
                {unreadCount > 0 && (
                  <>
                    <span className="nf-summary-dot" />
                    <span className="nf-summary-unread">
                      {unreadCount} unread
                    </span>
                  </>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  className="nf-mark-all"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  <IonIcon icon={checkmarkDoneOutline} />
                  {markAllReadMutation.isPending ? 'Marking...' : 'Mark all read'}
                </button>
              )}
            </div>
          )}

          {/* ── FILTER TABS ── */}
          {!isLoading && !isError && notifications.length > 0 && (
            <div className="nf-tabs">
              {([
                { key: 'all' as const, label: 'All', count: notifications.length },
                { key: 'unread' as const, label: 'Unread', count: unreadCount },
                { key: 'read' as const, label: 'Read', count: readCount },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  className={`nf-tab ${filter === tab.key ? 'nf-tab--active' : ''}`}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label}
                  <span className="nf-tab-count">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── LOADING ── */}
          {isLoading && (
            <div className="nf-loading">
              {[...Array(5)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {/* ── ERROR ── */}
          {!isLoading && isError && (
            <div className="nf-empty">
              <div className="nf-empty-icon">
                <IonIcon icon={alertCircleOutline} />
              </div>
              <h3>Unable to load notifications</h3>
              <p>Please try again</p>
              <button className="nf-retry-btn" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}

          {/* ── EMPTY ── */}
          {!isLoading && !isError && notifications.length === 0 && (
            <div className="nf-empty">
              <div className="nf-empty-icon">
                <IonIcon icon={notificationsOutline} />
              </div>
              <h3>You're all caught up</h3>
              <p>There are no new notifications right now</p>
            </div>
          )}

          {/* ── FILTER EMPTY ── */}
          {!isLoading && !isError && notifications.length > 0 && filteredNotifications.length === 0 && (
            <div className="nf-empty">
              <div className="nf-empty-icon">
                <IonIcon icon={notificationsOutline} />
              </div>
              <h3>No {filter} notifications</h3>
              <p>There are no {filter} notifications to display</p>
            </div>
          )}

          {/* ── NOTIFICATION LIST ── */}
          {!isLoading && !isError && notifications.length > 0 && (
            <div className="nf-list">
              {categoryKeys.map((category) => {
                const items = groupedNotifications.get(category)!;
                return (
                  <div key={category} className="nf-group">
                    <div className="nf-group-header">
                      <IonIcon icon={timeOutline} />
                      <span>{category}</span>
                      <span className="nf-group-count">{items.length}</span>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {items.map((notification, idx) => (
                        <motion.div
                          key={notification.id}
                          className={`nf-item ${!notification.read ? 'nf-item--unread' : ''}`}
                          custom={idx}
                          variants={itemVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          layout
                          onClick={() => handleNotificationClick(notification)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleNotificationClick(notification);
                            }
                          }}
                          aria-label={`${notification.title} - ${notification.read ? 'read' : 'unread'}`}
                        >
                          <div className={`nf-item-icon nf-item-icon--${notification.type}`}>
                            <IonIcon icon={typeIcons[notification.type] || informationCircleOutline} />
                          </div>

                          <div className="nf-item-body">
                            <div className="nf-item-top">
                              <span className="nf-item-title">{notification.title}</span>
                              <span className="nf-item-time">{getTimeAgo(notification.created_at)}</span>
                            </div>
                            <p className="nf-item-message">{notification.message}</p>
                            <div className="nf-item-footer">
                              <span className={`nf-badge nf-badge--${notification.type}`}>
                                {notification.type}
                              </span>
                            </div>
                          </div>

                          {!notification.read && <span className="nf-unread-dot" />}

                          <button
                            className="nf-delete-btn"
                            onClick={(e) => handleDelete(e, notification.id)}
                            aria-label="Delete notification"
                            title="Delete"
                          >
                            <IonIcon icon={trashOutline} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2000}
          position="bottom"
          className="nf-toast"
        />
      </DashboardLayout>
    </IonPage>
  );
};

export default NotificationsPage;
