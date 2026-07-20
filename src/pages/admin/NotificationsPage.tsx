import React, { useState, useRef } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonCard,
  IonCardContent,
  IonToast,
  IonTextarea,
} from '@ionic/react';
import {
  notificationsOutline,
  sendOutline,
  imageOutline,
  checkmarkCircle,
  closeCircle,
  timeOutline,
  chatbubbleOutline,
  mailOutline,
  phonePortraitOutline,
  peopleOutline,
  personOutline,
} from 'ionicons/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import AdminLayout from '../../layouts/AdminLayout';
import './NotificationsPage.css';

type RecipientType = 'everyone' | 'specific';
type NotificationType = 'info' | 'success' | 'warning' | 'error';

const NotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [recipientType, setRecipientType] = useState<RecipientType>('everyone');
  const [specificEmail, setSpecificEmail] = useState('');
  const [notifType, setNotifType] = useState<NotificationType>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageName, setImageName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: recentNotifications = [] } = useQuery({
    queryKey: ['admin_recent_notifications'],
    queryFn: async () => {
      const r = await supabase.from('notifications').select('*, profiles(full_name, email)').order('created_at', { ascending: false }).limit(20);
      return r.data || [];
    },
  });

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      setToastMessage('Title and message are required');
      setShowToast(true);
      return;
    }
    if (recipientType === 'specific' && !specificEmail.trim()) {
      setToastMessage('Please enter an email address for the specific user');
      setShowToast(true);
      return;
    }
    setSending(true);
    try {
      let userIds: string[] = [];

      if (recipientType === 'everyone') {
        const { data: profiles } = await supabase.from('profiles').select('id');
        userIds = (profiles || []).map((p: any) => p.id);
      } else if (recipientType === 'specific') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', specificEmail).single();
        if (!profile) {
          setToastMessage('User with that email not found');
          setShowToast(true);
          setSending(false);
          return;
        }
        userIds = [profile.id];
      }

      let imageUrl = '';
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const filePath = `notifications/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
          imageUrl = urlData?.publicUrl || '';
        }
      }

      const notifications = userIds.map((userId: string) => ({
        user_id: userId,
        title: title.trim(),
        message: message.trim(),
        type: notifType,
        read: false,
        image_url: imageUrl || undefined,
      }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);

        if (sendPush) {
          for (const uid of userIds) {
            try {
              await supabase.functions.invoke('send-push', {
                body: {
                  user_id: uid,
                  title: title.trim(),
                  body: message.trim(),
                  url: '/notifications',
                  type: 'marketing',
                },
              });
            } catch {
              // push is non-critical
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['admin_recent_notifications'] });
      setTitle('');
      setMessage('');
      setImageName('');
      setToastMessage(`Notification sent to ${userIds.length} user(s)`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to send notification');
      setShowToast(true);
    } finally {
      setSending(false);
    }
  };

  const handleAttachImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageName(file.name);
    }
  };

  const recipientOptions: { value: RecipientType; label: string; icon: string }[] = [
    { value: 'everyone', label: 'Everyone', icon: 'peopleOutline' },
    { value: 'specific', label: 'Specific User', icon: 'personOutline' },
  ];

  const recipientIcons: Record<string, string> = {
    peopleOutline, personOutline,
  };

  const notifTypeIcons: Record<string, string> = {
    chatbubbleOutline, checkmarkCircle, timeOutline, closeCircle,
  };

  const notifTypes: { value: NotificationType; label: string; icon: string }[] = [
    { value: 'info', label: 'Info', icon: 'chatbubbleOutline' },
    { value: 'success', label: 'Success', icon: 'checkmarkCircle' },
    { value: 'warning', label: 'Warning', icon: 'timeOutline' },
    { value: 'error', label: 'Error', icon: 'closeCircle' },
  ];

  return (
    <AdminLayout>
      <div className="admin-notifications-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={notificationsOutline} className="page-icon" />
            <h1>Send Notification</h1>
          </div>
        </motion.div>

        <div className="notif-content">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="notif-form-card">
            <IonCard className="form-card">
              <IonCardContent>
                <div className="form-section">
                  <div className="form-section-title">Recipient</div>
                  <div className="recipient-options">
                    {recipientOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`recipient-btn ${recipientType === opt.value ? 'recipient-active' : ''}`}
                        onClick={() => setRecipientType(opt.value)}
                      >
                        <IonIcon icon={recipientIcons[opt.icon]} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {recipientType === 'specific' && (
                    <IonItem className="specific-email-item">
                      <IonLabel position="stacked">User Email</IonLabel>
                      <IonInput type="email" value={specificEmail} onIonChange={(e) => setSpecificEmail(e.detail.value || '')} placeholder="user@email.com" />
                    </IonItem>
                  )}
                </div>

                <div className="form-section">
                  <div className="form-section-title">Notification Type</div>
                  <div className="notif-type-options">
                    {notifTypes.map(nt => (
                      <button
                        key={nt.value}
                        className={`type-btn ${notifType === nt.value ? 'type-active' : ''}`}
                        onClick={() => setNotifType(nt.value)}
                      >
                        <IonIcon icon={notifTypeIcons[nt.icon] || chatbubbleOutline} />
                        <span>{nt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-title">Content</div>
                  <IonItem>
                    <IonLabel position="stacked">Title</IonLabel>
                    <IonInput value={title} onIonChange={(e) => setTitle(e.detail.value || '')} placeholder="Notification title..." />
                  </IonItem>
                  <IonItem>
                    <IonLabel position="stacked">Message</IonLabel>
                    <IonTextarea value={message} onIonChange={(e) => setMessage(e.detail.value || '')} placeholder="Write your message..." rows={5} />
                  </IonItem>
                  <div className="attach-section">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                    <button className="attach-btn" onClick={handleAttachImage}>
                      <IonIcon icon={imageOutline} />
                      <span>{imageName || 'Attach Image'}</span>
                    </button>
                  </div>
                </div>

                <div className="form-section">
                  <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                      <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span className="toggle-slider" style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: sendPush ? '#FFCB05' : '#ccc', borderRadius: 24, transition: '0.3s' }} />
                    </label>
                    <span style={{ fontSize: 14, color: '#666' }}>Also send as push notification</span>
                  </div>
                </div>

                <IonButton expand="block" className="send-btn" onClick={handleSend} disabled={sending}>
                  <IonIcon icon={sendOutline} slot="start" />
                  {sending ? 'Sending...' : 'Send Notification'}
                </IonButton>
              </IonCardContent>
            </IonCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="notif-history-card">
            <IonCard className="form-card">
              <IonCardContent>
                <div className="form-section-title history-title">
                  <IonIcon icon={notificationsOutline} />
                  <span>Recent Notifications</span>
                </div>
                <div className="sent-list">
                  {recentNotifications.length === 0 ? (
                    <p className="empty-history">No notifications sent yet</p>
                  ) : (
                    recentNotifications.map((n: any, i: number) => (
                      <motion.div key={n.id} className="sent-item" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                        <div className="sent-item-top">
                          <span className="sent-title">{n.title}</span>
                          <span className={`sent-status sent`}>Sent</span>
                        </div>
                        <div className="sent-item-bottom">
                          <span className="sent-recipient">
                            <IonIcon icon={personOutline} />
                            {n.profiles?.full_name || n.user_id?.slice(0, 8) || 'User'}
                          </span>
                          <span className="sent-date">{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </IonCardContent>
            </IonCard>
          </motion.div>
        </div>
      </div>

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color="success"
      />
    </AdminLayout>
  );
};

export default NotificationsPage;
