import React, { useState, useMemo, useCallback } from 'react';
import {
  IonPage,
  IonIcon,
  IonButton,
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

const typeLabels: Record<string, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
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

const notificationVariants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.035, type: 'spring' as const, stiffness: 300, damping: 28 },
  }),
  exit: { opacity: 0, x: 60, transition: { duration: 0.2 } },
} as const;

const containerVariants = {
  animate: { transition: { staggerChildren: 0.03 } },
};

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-icon" />
      <div className="skeleton-lines">
        <div className="skeleton-line skeleton-line--title" />
        <div className="skeleton-line skeleton-line--message" />
      </div>
    </div>
  );
}

const NotificationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const showToastMessage = useCallback((msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  }, []);

  const { data: notifications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!user?.id,
  });

  const groupedNotifications = useMemo(() => groupByDateCategory(notifications), [notifications]);
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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user!.id)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToastMessage('All notifications marked as read');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToastMessage('Notification removed');
    },
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

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
          className="notifications-page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
            <div className="notifications-header">
              <div className="notifications-header-left">
                <div className="notifications-title-wrap">
                  <div className="title-icon-wrap">
                    <IonIcon icon={notificationsCircleOutline} className="title-bell-icon" />
                  </div>
                  <div className="title-text-wrap">
                    <h1 className="notifications-title">Notifications</h1>
                    <span className="title-subtitle">Stay updated with your latest activities</span>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <span className="unread-badge">{unreadCount} new</span>
                )}
              </div>
              <div className="notifications-header-actions">
                {unreadCount > 0 && (
                  <IonButton
                    fill="clear"
                    className="mark-all-btn"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={markAllReadMutation.isPending}
                  >
                    <IonIcon icon={checkmarkDoneOutline} slot="start" />
                    {markAllReadMutation.isPending ? 'Marking...' : 'Mark All Read'}
                  </IonButton>
                )}
              </div>
            </div>


            {isLoading ? (
              <div className="skeleton-container">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <SkeletonCard />
                  </motion.div>
                ))}
              </div>
            ) : isError ? (
              <motion.div
                className="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="empty-icon-circle">
                  <IonIcon icon={notificationsOutline} className="empty-icon" />
                </div>
                <h3>Failed to load notifications</h3>
                <p>Pull down to try again</p>
              </motion.div>
            ) : (
              <AnimatePresence mode="wait">
                {notifications.length === 0 ? (
                  <motion.div
                    key="empty"
                    className="empty-state"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div className="empty-icon-circle">
                      <IonIcon icon={notificationsOutline} className="empty-icon" />
                    </div>
                    <h3>All caught up!</h3>
                    <p>You have no notifications at the moment</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    className="notifications-list"
                    variants={containerVariants}
                    initial="initial"
                    animate="animate"
                  >
                    {categoryKeys.map((category) => {
                      const items = groupedNotifications.get(category)!;
                      return (
                        <div key={category} className="notification-group">
                          <div className="notification-group-header">
                            <IonIcon icon={timeOutline} className="group-icon" />
                            <span>{category}</span>
                            <span className="group-count">{items.length}</span>
                          </div>
                          {items.map((notification, idx) => (
                            <motion.div
                              key={notification.id}
                              className={`notification-item ${!notification.read ? 'unread' : ''}`}
                              custom={idx}
                              variants={notificationVariants}
                              layout
                              exit="exit"
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className={`notification-accent ${notification.type}`} />
                              <div className={`notification-icon icon-${notification.type}`}>
                                <IonIcon icon={typeIcons[notification.type] || informationCircleOutline} />
                              </div>
                              <div className="notification-body">
                                <div className="notification-top">
                                  <span className="notification-title">{notification.title}</span>
                                  <span className="notification-time">
                                    {getTimeAgo(notification.created_at)}
                                  </span>
                                </div>
                                <p className="notification-message">{notification.message}</p>
                                <div className="notification-footer">
                                  <span className={`notification-type-tag type-${notification.type}`}>
                                    {typeLabels[notification.type] || 'Info'}
                                  </span>
                                </div>
                              </div>
                              {!notification.read && <span className="unread-dot" />}
                              <button
                                className="notification-delete"
                                onClick={(e) => handleDelete(e, notification.id)}
                                aria-label="Delete notification"
                              >
                                <IonIcon icon={trashOutline} />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
        </motion.div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2000}
          position="bottom"
          className="notif-toast"
        />
      </DashboardLayout>
    </IonPage>
  );
};

export default NotificationsPage;
