import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonIcon } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeOutline,
  checkmarkDoneOutline,
  walletOutline,
  documentTextOutline,
  settingsOutline,
  arrowForwardOutline,
} from 'ionicons/icons';
import { notificationApi } from '../services/api';
import type { Notification } from '../types';
import { formatGhanaDateTime } from '../utils/date';
import { categorizeNotification, type NotificationCategory } from '../utils/notificationCategory';
import './NotificationHub.css';

export type HubTab = 'all' | NotificationCategory;

const TABS: { key: HubTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'financial', label: 'Financial' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'system', label: 'System' },
];

const CATEGORY_META: Record<NotificationCategory, { icon: string; path: string }> = {
  financial: { icon: walletOutline, path: '/cyberin/payments' },
  approvals: { icon: documentTextOutline, path: '/cyberin/registrations' },
  system: { icon: settingsOutline, path: '/cyberin/dashboard' },
};

const TYPE_DOT: Record<Notification['type'], string> = {
  info: 'nh-dot--info',
  success: 'nh-dot--success',
  warning: 'nh-dot--warning',
  error: 'nh-dot--error',
};

interface NotificationHubRowProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onOpen: (category: NotificationCategory) => void;
}

const NotificationHubRow: React.FC<NotificationHubRowProps> = ({ notification, onMarkRead, onOpen }) => {
  const category = categorizeNotification(notification);
  const unread = !notification.read;
  const meta = CATEGORY_META[category];

  return (
    <motion.div
      className="nh-row-wrap"
      drag={unread ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.35}
      onDragEnd={(_, info) => {
        if (unread && Math.abs(info.offset.x) > 80) onMarkRead(notification.id);
      }}
      whileTap={unread ? { cursor: 'grabbing' } : undefined}
    >
      <div className="nh-row-bg" aria-hidden="true">
        <IonIcon icon={checkmarkDoneOutline} />
        <span>Mark read</span>
      </div>
      <div className={`nh-row ${unread ? 'nh-row--unread' : ''}`}>
        <span className={`nh-dot ${TYPE_DOT[notification.type]} ${unread ? '' : 'nh-dot--read'}`} aria-hidden="true" />
        <div className="nh-row-body">
          <p className="nh-row-title">{notification.title}</p>
          <p className="nh-row-message">{notification.message}</p>
          <p className="nh-row-time">{formatGhanaDateTime(notification.created_at)}</p>
        </div>
        <button
          type="button"
          className="nh-row-open"
          aria-label={`Open ${category}`}
          onClick={(e) => {
            e.stopPropagation();
            if (unread) onMarkRead(notification.id);
            onOpen(category);
          }}
        >
          <IonIcon icon={meta.icon} />
          <IonIcon icon={arrowForwardOutline} />
        </button>
      </div>
    </motion.div>
  );
};

interface NotificationHubProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Admin notification inbox as an M3 bottom sheet: filter tabs, swipe-to-read,
 * and per-category quick actions into the relevant admin section.
 */
export const NotificationHub: React.FC<NotificationHubProps> = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const history = useHistory();
  const [tab, setTab] = useState<HubTab>('all');

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['admin_notifications_hub'],
    queryFn: () => notificationApi.list(),
    enabled: open,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin_unread_count'] });
    queryClient.invalidateQueries({ queryKey: ['admin_notifications_hub'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Notification[]>(['admin_notifications_hub'], (old) =>
        old?.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      queryClient.invalidateQueries({ queryKey: ['admin_unread_count'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: invalidate,
  });

  const filtered = useMemo(
    () => (tab === 'all' ? notifications : notifications.filter((n) => categorizeNotification(n) === tab)),
    [notifications, tab]
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const counts = useMemo(
    () => ({
      all: notifications.length,
      financial: notifications.filter((n) => categorizeNotification(n) === 'financial').length,
      approvals: notifications.filter((n) => categorizeNotification(n) === 'approvals').length,
      system: notifications.filter((n) => categorizeNotification(n) === 'system').length,
    }),
    [notifications]
  );

  if (!open) return null;

  const openCategory = (category: NotificationCategory) => {
    history.push(CATEGORY_META[category].path);
    onClose();
  };

  return createPortal(
    <>
      <div className="nh-scrim" onClick={onClose} aria-hidden="true" />
      <div className="nh-sheet" role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="m3-sheet-handle" aria-hidden="true" />

        <div className="nh-header">
          <div>
            <p className="nh-title">Notifications</p>
            {unreadCount > 0 && (
              <p className="nh-subtitle m3-numeric">{unreadCount} unread</p>
            )}
          </div>
          <div className="nh-header-actions">
            {unreadCount > 0 && (
              <button
                type="button"
                className="nh-mark-all"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                <IonIcon icon={checkmarkDoneOutline} />
                <span>Mark all read</span>
              </button>
            )}
            <button type="button" className="nh-close" onClick={onClose} aria-label="Close notifications">
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        </div>

        <div className="nh-tabs" role="tablist" aria-label="Notification categories">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`nh-tab ${tab === t.key ? 'nh-tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
              {counts[t.key] > 0 && <span className="nh-tab-count m3-numeric">{counts[t.key]}</span>}
            </button>
          ))}
        </div>

        <div className="nh-list">
          {isLoading ? (
            <div className="nh-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="nh-row nh-row--skeleton" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="nh-empty">
              <IonIcon icon={checkmarkDoneOutline} />
              <p>You&apos;re all caught up</p>
            </div>
          ) : (
            filtered.map((n) => (
              <NotificationHubRow
                key={n.id}
                notification={n}
                onMarkRead={(id) => markReadMutation.mutate(id)}
                onOpen={openCategory}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

export default NotificationHub;
