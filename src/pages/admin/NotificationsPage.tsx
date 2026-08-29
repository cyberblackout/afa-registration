import React, { useState, useRef } from 'react';
import {
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonToast,
  IonTextarea,
} from '@ionic/react';
import {
  notificationsOutline,
  sendOutline,
  mailOutline,
  chatbubbleOutline,
  phonePortraitOutline,
  personOutline,
  checkmarkCircle,
  closeCircle,
  timeOutline,
  refreshOutline,
  eyeOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { notificationApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import Card from '../../components/Card';
import { formatGhanaDateTime } from '../../utils/date';
import './NotificationsPage.css';

type Tab = 'email' | 'sms' | 'push' | 'log';
type RecipientType = 'everyone' | 'specific';

const statusColors: Record<string, string> = {
  pending: '#f57f17',
  sent: '#2e7d32',
  failed: '#c62828',
  delivered: '#1565c0',
  bounced: '#c62828',
};

const NotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('email');
  const [recipientType, setRecipientType] = useState<RecipientType>('everyone');
  const [specificEmail, setSpecificEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isMarketing, setIsMarketing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState('success');
  const [logChannelFilter, setLogChannelFilter] = useState<string>('all');

  // Delivery log query
  const { data: deliveryLog = [], isLoading: logLoading } = useQuery({
    queryKey: ['notifications_log', logChannelFilter],
    queryFn: async () => {
      let query = supabase
        .from('notifications_log')
        .select('*, profiles!notifications_log_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (logChannelFilter !== 'all') {
        query = query.eq('channel', logChannelFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: activeTab === 'log',
  });

  const resolveRecipients = async (): Promise<{ userIds: string[]; emails: string[]; phones: string[] }> => {
    if (recipientType === 'everyone') {
      const allIds = await notificationApi.adminGetAllUserIds();
      // Get profiles with emails and phones
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, phone')
        .in('id', allIds);
      return {
        userIds: allIds,
        emails: (profiles || []).map((p: any) => p.email).filter(Boolean),
        phones: (profiles || []).map((p: any) => p.phone).filter(Boolean),
      };
    } else {
      const resolvedId = await notificationApi.adminResolveEmail(specificEmail);
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, phone')
        .eq('id', resolvedId)
        .single();
      return {
        userIds: [resolvedId],
        emails: profile?.email ? [profile.email] : [],
        phones: profile?.phone ? [profile.phone] : [],
      };
    }
  };

  const showToastMsg = (msg: string, color = 'success') => {
    setToastMessage(msg);
    setToastColor(color);
    setShowToast(true);
  };

  const handleSendEmail = async () => {
    if (!subject.trim() || !message.trim()) {
      showToastMsg('Subject and message are required', 'warning');
      return;
    }
    setSending(true);
    try {
      const recipients = await resolveRecipients();
      if (recipients.emails.length === 0) {
        showToastMsg('No email addresses found for recipients', 'warning');
        setSending(false);
        return;
      }

      let sent = 0;
      let skipped = 0;
      for (let i = 0; i < recipients.userIds.length; i++) {
        const email = recipients.emails[i];
        if (!email) { skipped++; continue; }
        const result = await notificationApi.sendEmail(
          email,
          subject.trim(),
          message.trim(),
          isMarketing ? 'marketing' : 'transactional',
          recipients.userIds[i]
        );
        if (result?.skipped) skipped++;
        else sent++;
      }

      // Also insert in-app notification
      await notificationApi.adminSend(subject.trim(), message.trim(), 'info', recipients.userIds, recipientType === 'everyone');

      showToastMsg(`Email: ${sent} sent, ${skipped} skipped (opted out)`);
      queryClient.invalidateQueries({ queryKey: ['notifications_log'] });
      setSubject('');
      setMessage('');
    } catch (err: any) {
      showToastMsg(err.message || 'Failed to send email', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleSendSms = async () => {
    if (!message.trim()) {
      showToastMsg('Message is required', 'warning');
      return;
    }
    setSending(true);
    try {
      const recipients = await resolveRecipients();
      if (recipients.phones.length === 0) {
        showToastMsg('No phone numbers found for recipients', 'warning');
        setSending(false);
        return;
      }

      let sent = 0;
      let skipped = 0;
      for (let i = 0; i < recipients.userIds.length; i++) {
        const phone = recipients.phones[i];
        if (!phone) { skipped++; continue; }
        const result = await notificationApi.sendSms(
          recipients.userIds[i],
          phone,
          message.trim(),
          isMarketing ? 'marketing' : 'transactional'
        );
        if (result?.skipped) skipped++;
        else sent++;
      }

      showToastMsg(`SMS: ${sent} sent, ${skipped} skipped (opted out)`);
      queryClient.invalidateQueries({ queryKey: ['notifications_log'] });
      setMessage('');
    } catch (err: any) {
      showToastMsg(err.message || 'Failed to send SMS', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleSendPush = async () => {
    if (!subject.trim() || !message.trim()) {
      showToastMsg('Title and message are required', 'warning');
      return;
    }
    setSending(true);
    try {
      let sent = 0;
      let skipped = 0;

      if (recipientType === 'everyone') {
        const result = await notificationApi.sendPush(
          null,
          subject.trim(),
          message.trim(),
          '/notifications',
          isMarketing ? 'marketing' : 'transactional'
        );
        sent = result?.sent || 0;
        skipped = result?.skipped || 0;
      } else {
        const resolvedId = await notificationApi.adminResolveEmail(specificEmail);
        const result = await notificationApi.sendPush(
          resolvedId,
          subject.trim(),
          message.trim(),
          '/notifications',
          isMarketing ? 'marketing' : 'transactional'
        );
        if (result?.skipped) skipped = 1;
        else sent = result?.sent || 0;
      }

      showToastMsg(`Push: ${sent} sent, ${skipped} skipped (opted out)`);
      queryClient.invalidateQueries({ queryKey: ['notifications_log'] });
      setSubject('');
      setMessage('');
    } catch (err: any) {
      showToastMsg(err.message || 'Failed to send push', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (activeTab === 'email') handleSendEmail();
    else if (activeTab === 'sms') handleSendSms();
    else if (activeTab === 'push') handleSendPush();
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'email', label: 'Email', icon: 'mailOutline' },
    { key: 'sms', label: 'SMS', icon: 'chatbubbleOutline' },
    { key: 'push', label: 'Push', icon: 'phonePortraitOutline' },
    { key: 'log', label: 'Log', icon: 'eyeOutline' },
  ];

  const tabIcons: Record<string, string> = { mailOutline, chatbubbleOutline, phonePortraitOutline, eyeOutline };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications_log'] });
  };

  return (
    <IonPage>
      <AdminLayout onRefresh={handleRefresh}>
        <div className="admin-notifications-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={notificationsOutline} className="page-icon" />
            <h1>Notifications</h1>
          </div>
        </motion.div>

        <div className="notif-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`notif-tab ${activeTab === tab.key ? 'notif-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <IonIcon icon={tabIcons[tab.icon] || notificationsOutline} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab !== 'log' ? (
            <motion.div key="compose" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="notif-compose">
              <Card className="notif-form-card">
                <div className="form-section">
                  <div className="form-section-title">Channel</div>
                  <div className="channel-badge">
                    <IonIcon icon={tabIcons[tabs.find(t => t.key === activeTab)?.icon || 'mailOutline']} />
                    <span>{tabs.find(t => t.key === activeTab)?.label}</span>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Recipient</div>
                  <div className="recipient-options">
                    <button className={`recipient-btn ${recipientType === 'everyone' ? 'recipient-active' : ''}`} onClick={() => setRecipientType('everyone')}>
                      <IonIcon icon={notificationsOutline} />
                      <span>Everyone</span>
                    </button>
                    <button className={`recipient-btn ${recipientType === 'specific' ? 'recipient-active' : ''}`} onClick={() => setRecipientType('specific')}>
                      <IonIcon icon={personOutline} />
                      <span>Specific User</span>
                    </button>
                  </div>
                  {recipientType === 'specific' && (
                    <IonItem className="specific-email-item">
                      <IonLabel position="stacked">User Email</IonLabel>
                      <IonInput type="email" value={specificEmail} onIonChange={(e) => setSpecificEmail(e.detail.value || '')} placeholder="user@email.com" />
                    </IonItem>
                  )}
                </div>

                {activeTab === 'email' && (
                  <div className="form-section">
                    <div className="form-section-title">Subject</div>
                    <IonItem>
                      <IonInput value={subject} onIonChange={(e) => setSubject(e.detail.value || '')} placeholder="Email subject..." />
                    </IonItem>
                  </div>
                )}

                <div className="form-section">
                  <div className="form-section-title">Content</div>
                  <IonItem>
                    <IonLabel position="stacked">{activeTab === 'email' ? 'Email Body' : activeTab === 'sms' ? 'SMS Message' : 'Push Title'}</IonLabel>
                    {activeTab === 'push' ? (
                      <IonInput value={subject} onIonChange={(e) => setSubject(e.detail.value || '')} placeholder="Push notification title..." />
                    ) : (
                      <IonTextarea value={message} onIonChange={(e) => setMessage(e.detail.value || '')} placeholder={activeTab === 'email' ? 'Write your email...' : 'Write your SMS...'} rows={5} />
                    )}
                  </IonItem>
                  {activeTab === 'push' && (
                    <IonItem>
                      <IonLabel position="stacked">Push Body</IonLabel>
                      <IonTextarea value={message} onIonChange={(e) => setMessage(e.detail.value || '')} placeholder="Push notification body..." rows={3} />
                    </IonItem>
                  )}
                </div>

                <div className="form-section">
                  <div className="toggle-row">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={isMarketing} onChange={(e) => setIsMarketing(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                    <span className="toggle-label">Marketing message (respects opt-out)</span>
                  </div>
                </div>

                <IonButton expand="block" className="send-btn" onClick={handleSend} disabled={sending}>
                  <IonIcon icon={sendOutline} slot="start" />
                  {sending ? 'Sending...' : `Send ${tabs.find(t => t.key === activeTab)?.label}`}
                </IonButton>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="log" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="notif-log">
              <div className="log-filters">
                {['all', 'email', 'sms', 'push'].map(ch => (
                  <button key={ch} className={`log-filter-btn ${logChannelFilter === ch ? 'filter-active' : ''}`} onClick={() => setLogChannelFilter(ch)}>
                    {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </button>
                ))}
              </div>

              <div className="log-list">
                {logLoading ? (
                  <div className="empty-history">Loading log...</div>
                ) : deliveryLog.length === 0 ? (
                  <div className="empty-history">No notifications sent yet</div>
                ) : (
                  deliveryLog.map((entry: any) => (
                    <div key={entry.id} className="log-item">
                      <div className="log-item-top">
                        <span className={`log-channel-badge log-channel-${entry.channel}`}>{entry.channel}</span>
                        <span className="log-status" style={{ color: statusColors[entry.status] || '#666' }}>
                          {entry.status}
                        </span>
                        {entry.is_marketing && <span className="log-marketing-badge">Marketing</span>}
                      </div>
                      <div className="log-item-mid">
                        <span className="log-recipient">{entry.recipient}</span>
                        {entry.subject && <span className="log-subject">{entry.subject}</span>}
                      </div>
                      <div className="log-item-bottom">
                        <span className="log-date">{formatGhanaDateTime(entry.created_at)}</span>
                        {entry.error_message && <span className="log-error">{entry.error_message}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)} message={toastMessage} duration={4000} position="top" color={toastColor as any} />
    </AdminLayout>
    </IonPage>
  );
};

export default NotificationsPage;
