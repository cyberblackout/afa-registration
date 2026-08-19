import React, { useState, useEffect } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonCard,
  IonCardContent,
  IonToast,
  IonToggle,
  IonTextarea,
} from '@ionic/react';
import {
  settingsOutline,
  pricetagOutline,
  chatbubbleOutline,
  mailOutline,
  notificationsCircleOutline,
  phonePortraitOutline,
  giftOutline,
  ribbonOutline,
  saveOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminSettingsApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [feeValues, setFeeValues] = useState<Record<string, string>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const FEE_PRICING_KEYS = ['afa_registration', 'wallet_max_topup', 'wallet_min_topup', 'referral_bonus'];

  const setFeeValue = (key: string, value: string) => setFeeValues(prev => ({ ...prev, [key]: value }));

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['admin_settings'],
    queryFn: async () => {
      const result = await adminSettingsApi.getAll() as any;
      const appVals = (result.app_settings || []).map((s: any) => ({ key: s.key, value: s.value }));
      const sysVals = (result.system_settings || []).map((s: any) => ({ key: s.setting_name, value: s.setting_value }));
      return [...appVals, ...sysVals] as any;
    },
  });

  useEffect(() => {
    if (settingsData && settingsData.length > 0) {
      const vals: Record<string, string> = {};
      settingsData.forEach((s: any) => { vals[s.key] = s.value; });
      setSettings(prev => ({ ...vals, ...prev }));
    }
  }, [settingsData]);

  const { data: feePricing } = useQuery({
    queryKey: ['admin_settings_fees'],
    queryFn: async () => {
      const result = await adminSettingsApi.getAll() as any;
      return (result.pricing || []).filter((p: any) => FEE_PRICING_KEYS.includes(p.key)) as any;
    },
  });

  useEffect(() => {
    if (feePricing && feePricing.length > 0) {
      setFeeValues(prev => {
        const next = { ...prev };
        feePricing.forEach((p: any) => { next[p.key] = p.amount?.toString() ?? ''; });
        return next;
      });
    }
  }, [feePricing]);

  const get = (key: string, fallback: string = '') => settings[key] ?? fallback;
  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

  const systemSettingKeys = ['whatsapp_user_number', 'whatsapp_agent_number', 'whatsapp_user_message', 'whatsapp_agent_message', 'whatsapp_enabled'];

  const saveSection = async (section: string, keys: string[]) => {
    setSaving(section);
    try {
      const isSystemSection = keys.every(k => systemSettingKeys.includes(k));
      const sectionSettings: Record<string, string> = {};
      keys.forEach(k => { sectionSettings[k] = settings[k]; });
      if (isSystemSection) {
        await adminSettingsApi.saveSystemSettings(sectionSettings);
      } else {
        await adminSettingsApi.saveAppSettings(sectionSettings);
      }
      queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
      setToastMessage(`${section} settings saved successfully`);
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Save failed');
      setShowToast(true);
    } finally {
      setSaving(null);
    }
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.4 } }),
  };

  const saveFees = async () => {
    const parse = (key: string): number => parseFloat(feeValues[key] ?? '');
    const fields: { key: string; label: string }[] = [
      { key: 'agent_fee', label: 'Agent Registration Fee' },
      { key: 'afa_registration', label: 'AFA Registration Fee' },
      { key: 'wallet_max_topup', label: 'Wallet Max Top-up' },
      { key: 'wallet_min_topup', label: 'Wallet Min Top-up' },
      { key: 'referral_bonus', label: 'Referral Bonus' },
    ];

    const values: Record<string, number> = {};
    for (const f of fields) {
      const v = parse(f.key);
      if (isNaN(v) || v < 0) {
        setToastMessage(`Invalid value for ${f.label}`);
        setShowToast(true);
        return;
      }
      values[f.key] = v;
    }

    if (values['wallet_min_topup'] >= values['wallet_max_topup']) {
      setToastMessage('Wallet Min Top-up must be less than Wallet Max Top-up');
      setShowToast(true);
      return;
    }

    setSaving('Fees');
    try {
      await adminSettingsApi.saveFees({
        agent_fee: values['agent_fee'],
        afa_registration: values['afa_registration'],
        wallet_max_topup: values['wallet_max_topup'],
        wallet_min_topup: values['wallet_min_topup'],
        referral_bonus: values['referral_bonus'],
      });
      queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin_settings_fees'] });
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      setToastMessage('Fees saved successfully');
      setShowToast(true);
    } catch (err: any) {
      setToastMessage(err.message || 'Save failed');
      setShowToast(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <AdminLayout>
      <div className="admin-settings-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={settingsOutline} className="page-icon" />
            <h1>Settings</h1>
          </div>
        </motion.div>

        {isLoading ? (
          <p>Loading settings...</p>
        ) : (
          <div className="settings-sections">
            <motion.div custom={0} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={settingsOutline} className="section-icon" />
                    <h2>General</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Site Name</IonLabel>
                      <IonInput value={get('site_name', 'MTN AFA Registration')} onIonChange={(e) => set('site_name', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Support Email</IonLabel>
                      <IonInput type="email" value={get('support_email', 'support@mtn-afa.com')} onIonChange={(e) => set('support_email', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Support Phone</IonLabel>
                      <IonInput value={get('support_phone', '+233 50 000 0000')} onIonChange={(e) => set('support_phone', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Address</IonLabel>
                      <IonTextarea value={get('address', 'MTN Tower, Ridge Accra, Ghana')} onIonChange={(e) => set('address', e.detail.value || '')} rows={2} />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('General', ['site_name', 'support_email', 'support_phone', 'address'])} disabled={saving === 'General'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'General' ? 'Saving...' : 'Save General'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={pricetagOutline} className="section-icon" />
                    <h2>Fees</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Agent Registration Fee (GH₵)</IonLabel>
                      <IonInput type="number" min={0} step="0.1" value={feeValues['agent_fee'] ?? get('agent_fee', '100')} onIonChange={(e) => setFeeValue('agent_fee', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">AFA Registration Fee (GH₵)</IonLabel>
                      <IonInput type="number" min={0} step="0.1" value={feeValues['afa_registration'] ?? ''} onIonChange={(e) => setFeeValue('afa_registration', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Wallet Max Top-up (GH₵)</IonLabel>
                      <IonInput type="number" min={0} step="0.1" value={feeValues['wallet_max_topup'] ?? ''} onIonChange={(e) => setFeeValue('wallet_max_topup', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Wallet Min Top-up (GH₵)</IonLabel>
                      <IonInput type="number" min={0} step="0.1" value={feeValues['wallet_min_topup'] ?? ''} onIonChange={(e) => setFeeValue('wallet_min_topup', e.detail.value || '')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Referral Bonus (GH₵)</IonLabel>
                      <IonInput type="number" min={0} step="0.1" value={feeValues['referral_bonus'] ?? ''} onIonChange={(e) => setFeeValue('referral_bonus', e.detail.value || '')} />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={saveFees} disabled={saving === 'Fees'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Fees' ? 'Saving...' : 'Save Fees'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={logoWhatsapp} className="section-icon" />
                    <h2>WhatsApp Settings</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Enable WhatsApp Button</IonLabel>
                      <IonToggle checked={get('whatsapp_enabled', 'true') === 'true'} onIonChange={(e) => set('whatsapp_enabled', e.detail.checked ? 'true' : 'false')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Support WhatsApp Number</IonLabel>
                      <IonInput value={get('whatsapp_user_number', '233501112222')} onIonChange={(e) => set('whatsapp_user_number', e.detail.value || '')} placeholder="233501112222" />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Agent WhatsApp Number</IonLabel>
                      <IonInput value={get('whatsapp_agent_number', '233501112222')} onIonChange={(e) => set('whatsapp_agent_number', e.detail.value || '')} placeholder="233501112222" />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Default User Message</IonLabel>
                      <IonTextarea value={get('whatsapp_user_message', 'Hello, I need help with my account.')} onIonChange={(e) => set('whatsapp_user_message', e.detail.value || '')} rows={2} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Default Agent Message</IonLabel>
                      <IonTextarea value={get('whatsapp_agent_message', 'Hello, I am an agent and I need assistance.')} onIonChange={(e) => set('whatsapp_agent_message', e.detail.value || '')} rows={2} />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('WhatsApp', ['whatsapp_enabled', 'whatsapp_user_number', 'whatsapp_agent_number', 'whatsapp_user_message', 'whatsapp_agent_message'])} disabled={saving === 'WhatsApp'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'WhatsApp' ? 'Saving...' : 'Save WhatsApp Settings'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={mailOutline} className="section-icon" />
                    <h2>Email</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Resend API Key</IonLabel>
                      <IonInput type="password" value={get('resend_api_key', '')} onIonChange={(e) => set('resend_api_key', e.detail.value || '')} placeholder="re_xxxxxxxxxxxx" />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">From Email</IonLabel>
                      <IonInput type="email" value={get('email_from', 'noreply@mtn-afa.com')} onIonChange={(e) => set('email_from', e.detail.value || '')} placeholder="noreply@yourdomain.com" />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('Email', ['resend_api_key', 'email_from'])} disabled={saving === 'Email'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Email' ? 'Saving...' : 'Save Email'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={phonePortraitOutline} className="section-icon" />
                    <h2>SMS</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">API URL</IonLabel>
                      <IonInput value={get('sms_api_url', '')} onIonChange={(e) => set('sms_api_url', e.detail.value || '')} placeholder="https://api.example.com/sms/send" />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">API Key</IonLabel>
                      <IonInput type="password" value={get('sms_api_key', '')} onIonChange={(e) => set('sms_api_key', e.detail.value || '')} placeholder="sk_test_xxxx" />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Sender ID</IonLabel>
                      <IonInput value={get('sms_sender_id', 'MTN-AFA')} onIonChange={(e) => set('sms_sender_id', e.detail.value || '')} placeholder="MTN-AFA" />
                    </IonItem>
                    <p style={{ fontSize: '13px', color: '#999', margin: '8px 16px' }}>
                      Supports any SMS provider with a JSON REST API that accepts <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>to</code>, <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>from</code>, <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>message</code> fields and Bearer token auth.
                    </p>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('SMS', ['sms_api_url', 'sms_api_key', 'sms_sender_id'])} disabled={saving === 'SMS'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'SMS' ? 'Saving...' : 'Save SMS Settings'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={6} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={giftOutline} className="section-icon" />
                    <h2>Referral Program</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Enable Referral System</IonLabel>
                      <IonToggle checked={get('referral_enabled', 'true') === 'true'} onIonChange={(e) => set('referral_enabled', e.detail.checked ? 'true' : 'false')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Reward Amount (GHC)</IonLabel>
                      <IonInput type="number" value={get('referral_reward_amount', '1')} onIonChange={(e) => set('referral_reward_amount', e.detail.value || '1')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Minimum Withdrawal (GHC)</IonLabel>
                      <IonInput type="number" value={get('referral_min_withdrawal', '20')} onIonChange={(e) => set('referral_min_withdrawal', e.detail.value || '20')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Max Daily Rewards</IonLabel>
                      <IonInput type="number" value={get('referral_max_daily', '50')} onIonChange={(e) => set('referral_max_daily', e.detail.value || '50')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Fraud Protection</IonLabel>
                      <IonToggle checked={get('referral_fraud_protection', 'true') === 'true'} onIonChange={(e) => set('referral_fraud_protection', e.detail.checked ? 'true' : 'false')} />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('Referral', ['referral_enabled', 'referral_reward_amount', 'referral_min_withdrawal', 'referral_max_daily', 'referral_fraud_protection'])} disabled={saving === 'Referral'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Referral' ? 'Saving...' : 'Save Referral Settings'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={7} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={ribbonOutline} className="section-icon" />
                    <h2>Agent System</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">Enable Agent System</IonLabel>
                      <IonToggle checked={get('agent_system_enabled', 'true') === 'true'} onIonChange={(e) => set('agent_system_enabled', e.detail.checked ? 'true' : 'false')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Auto-Approve Agents</IonLabel>
                      <IonToggle checked={get('agent_auto_approve', 'false') === 'true'} onIonChange={(e) => set('agent_auto_approve', e.detail.checked ? 'true' : 'false')} />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">Minimum Commission (GHC)</IonLabel>
                      <IonInput type="number" value={get('agent_min_commission', '10')} onIonChange={(e) => set('agent_min_commission', e.detail.value || '10')} />
                    </IonItem>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('Agent', ['agent_system_enabled', 'agent_auto_approve', 'agent_min_commission'])} disabled={saving === 'Agent'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Agent' ? 'Saving...' : 'Save Agent Settings'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>

            <motion.div custom={8} variants={sectionVariants} initial="hidden" animate="visible">
              <IonCard className="settings-card">
                <IonCardContent>
                  <div className="settings-card-header">
                    <IonIcon icon={notificationsCircleOutline} className="section-icon" />
                    <h2>Push Notifications</h2>
                  </div>
                  <div className="settings-fields">
                    <IonItem>
                      <IonLabel position="stacked">VAPID Public Key</IonLabel>
                      <IonInput value={get('vapid_public_key', '')} onIonChange={(e) => set('vapid_public_key', e.detail.value || '')} placeholder="BH7GpjPVgH..." />
                    </IonItem>
                    <IonItem>
                      <IonLabel position="stacked">VAPID Private Key</IonLabel>
                      <IonInput type="password" value={get('vapid_private_key', '')} onIonChange={(e) => set('vapid_private_key', e.detail.value || '')} placeholder="dGVzdC12YXBpZC..." />
                    </IonItem>
                    <p style={{ fontSize: '13px', color: '#999', margin: '8px 16px' }}>
                      Generate keys via <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>npx web-push generate-vapid-keys</code>
                    </p>
                  </div>
                  <IonButton expand="block" className="section-save-btn" onClick={() => saveSection('Push', ['vapid_public_key', 'vapid_private_key'])} disabled={saving === 'Push'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Push' ? 'Saving...' : 'Save Push Settings'}
                  </IonButton>
                </IonCardContent>
              </IonCard>
            </motion.div>
          </div>
        )}
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

export default SettingsPage;
