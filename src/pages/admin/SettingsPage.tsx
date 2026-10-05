import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IonButton,
  IonIcon,
  IonPage,
  IonToast,
  IonToggle,
} from '@ionic/react';
import {
  settingsOutline,
  pricetagOutline,
  chatbubbleOutline,
  walletOutline,
  notificationsCircleOutline,
  ribbonOutline,
  saveOutline,
  logoWhatsapp,
  informationCircleOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { adminSettingsApi } from '../../services/api';
import AdminLayout from '../../layouts/AdminLayout';
import Card from '../../components/Card';
import './SettingsPage.css';

// Must stay identical to the server schema in
// supabase/functions/admin-settings/index.ts (afaPriceSchema).
const MAX_AFA_PRICE = 1000000;

const afaPriceSchema = (label: string) =>
  z.unknown().transform((v, ctx): number => {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      ctx.addIssue({ code: 'custom', message: 'Both prices are required' });
      return z.NEVER;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} must be a number` });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: 'custom', message: `${label} must be greater than 0` });
      return z.NEVER;
    }
    if (Math.round(n * 100) / 100 !== n) {
      ctx.addIssue({ code: 'custom', message: `${label} supports a maximum of 2 decimal places` });
      return z.NEVER;
    }
    if (n > MAX_AFA_PRICE) {
      ctx.addIssue({ code: 'custom', message: `${label} cannot exceed 1,000,000.00` });
      return z.NEVER;
    }
    return n;
  });

const afaPricingSchema = z.object({
  normal_price: afaPriceSchema('Normal user price'),
  agent_price: afaPriceSchema('Agent price'),
});

const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [feeValues, setFeeValues] = useState<Record<string, string>>({});
  const [afaValues, setAfaValues] = useState<{ normal_price: string; agent_price: string }>({
    normal_price: '',
    agent_price: '',
  });
  const [afaInitialSnapshot, setAfaInitialSnapshot] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');
  const [saving, setSaving] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');

  // AFA prices deliberately excluded: they have their own action below.
  const FEE_PRICING_KEYS = ['wallet_max_topup', 'wallet_min_topup'];

  const setFeeValue = (key: string, value: string) => setFeeValues(prev => ({ ...prev, [key]: value }));

  const { data: settingsData, isLoading, isError, refetch } = useQuery({
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
      setSettings(prev => {
        const merged = { ...vals, ...prev };
        return merged;
      });
    }
  }, [settingsData]);

  useEffect(() => {
    if (settingsData && settingsData.length > 0 && Object.keys(settings).length > 0 && !initialSnapshot) {
      setInitialSnapshot(JSON.stringify({ settings, feeValues }));
    }
  }, [settingsData, settings, feeValues, initialSnapshot]);

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

  const { data: afaPricingRow, isLoading: afaPricingLoading, isError: afaPricingError } = useQuery({
    queryKey: ['admin_settings_afa'],
    queryFn: async () => {
      const result = await adminSettingsApi.getAll() as any;
      return ((result.pricing || []).find((p: any) => p.key === 'afa_registration') ?? null) as any;
    },
  });

  useEffect(() => {
    if (afaPricingRow) {
      const next = {
        normal_price: afaPricingRow.normal_price?.toString() ?? '',
        agent_price: afaPricingRow.agent_price?.toString() ?? '',
      };
      setAfaValues(next);
      setAfaInitialSnapshot(JSON.stringify(next));
    }
  }, [afaPricingRow]);

  const afaDirty = afaInitialSnapshot !== '' && JSON.stringify(afaValues) !== afaInitialSnapshot;

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    try {
      const initial = JSON.parse(initialSnapshot);
      return JSON.stringify(settings) !== JSON.stringify(initial.settings) ||
             JSON.stringify(feeValues) !== JSON.stringify(initial.feeValues);
    } catch {
      return false;
    }
  }, [settings, feeValues, initialSnapshot]);

  const get = useCallback((key: string, fallback: string = '') => settings[key] ?? fallback, [settings]);
  const set = useCallback((key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value })), []);

  const systemSettingKeys = ['whatsapp_user_number', 'whatsapp_agent_number', 'whatsapp_user_message', 'whatsapp_agent_message', 'whatsapp_enabled'];

  const saveSection = async (section: string, keys: string[]) => {
    setSaving(section);
    try {
      const isSystemSection = keys.every(k => systemSettingKeys.includes(k));
      const sectionSettings: Record<string, string> = {};
      keys.forEach(k => { sectionSettings[k] = String(settings[k] ?? ''); });
      if (isSystemSection) {
        await adminSettingsApi.saveSystemSettings(sectionSettings);
      } else {
        await adminSettingsApi.saveAppSettings(sectionSettings);
      }
      queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
      setToastColor('success');
      setToastMessage(`${section} settings saved successfully`);
      setShowToast(true);
      setInitialSnapshot(JSON.stringify({ settings, feeValues }));
    } catch (err: any) {
      setToastColor('danger');
      setToastMessage(err.message || 'Save failed');
      setShowToast(true);
    } finally {
      setSaving(null);
    }
  };

  const parseFee = (key: string): number => parseFloat(feeValues[key] ?? get(key, ''));

  const saveAfaPricing = async () => {
    const parsed = afaPricingSchema.safeParse(afaValues);
    if (!parsed.success) {
      setToastColor('danger');
      setToastMessage(parsed.error.issues.map(i => i.message).join('; ') || 'Invalid price');
      setShowToast(true);
      return;
    }

    setSaving('AFA Pricing');
    try {
      await adminSettingsApi.saveAfaPrices(parsed.data);
      await queryClient.invalidateQueries({ queryKey: ['admin_settings_afa'] });
      await queryClient.invalidateQueries({ queryKey: ['admin_settings_fees'] });
      await queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
      setToastColor('success');
      setToastMessage('AFA pricing saved successfully');
      setShowToast(true);
      setAfaInitialSnapshot(JSON.stringify(afaValues));
    } catch (err: any) {
      setToastColor('danger');
      setToastMessage(err.message || 'Save failed');
      setShowToast(true);
    } finally {
      setSaving(null);
    }
  };

  const saveFees = async () => {
    const fields: { key: string; label: string }[] = [
      { key: 'agent_fee', label: 'Agent Registration Fee' },
      { key: 'wallet_max_topup', label: 'Wallet Max Top-up' },
      { key: 'wallet_min_topup', label: 'Wallet Min Top-up' },
    ];

    const values: Record<string, number> = {};
    for (const f of fields) {
      const v = parseFee(f.key);
      if (isNaN(v) || v < 0) {
        setToastColor('danger');
        setToastMessage(`Invalid value for ${f.label}`);
        setShowToast(true);
        return;
      }
      values[f.key] = v;
    }

    if (values['wallet_min_topup'] >= values['wallet_max_topup']) {
      setToastColor('danger');
      setToastMessage('Wallet Min Top-up must be less than Wallet Max Top-up');
      setShowToast(true);
      return;
    }

    setSaving('Fees');
    try {
      await adminSettingsApi.saveFees({
        agent_fee: values['agent_fee'],
        wallet_max_topup: values['wallet_max_topup'],
        wallet_min_topup: values['wallet_min_topup'],
      });
      queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin_settings_fees'] });
      queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
      setToastColor('success');
      setToastMessage('Fees saved successfully');
      setShowToast(true);
      setInitialSnapshot(JSON.stringify({ settings, feeValues }));
    } catch (err: any) {
      setToastColor('danger');
      setToastMessage(err.message || 'Save failed');
      setShowToast(true);
    } finally {
      setSaving(null);
    }
  };

  const saveWalletReferral = async () => {
    const walletFeeFields = ['wallet_max_topup', 'wallet_min_topup'];
    const values: Record<string, number> = {};
    for (const key of walletFeeFields) {
      const v = parseFee(key);
      if (isNaN(v) || v < 0) {
        setToastColor('danger');
        setToastMessage(`Invalid value for ${key.replace(/_/g, ' ')}`);
        setShowToast(true);
        return;
      }
      values[key] = v;
    }

    if (values['wallet_min_topup'] >= values['wallet_max_topup']) {
      setToastColor('danger');
      setToastMessage('Wallet Min Top-up must be less than Wallet Max Top-up');
      setShowToast(true);
      return;
    }

    const agentFee = parseFee('agent_fee');

    setSaving('Wallet & Referral');
    try {
      await adminSettingsApi.saveFees({
        agent_fee: isNaN(agentFee) ? 0 : agentFee,
        wallet_max_topup: values['wallet_max_topup'],
        wallet_min_topup: values['wallet_min_topup'],
      });

      const sectionSettings: Record<string, string> = {
        referral_enabled: String(get('referral_enabled', 'true')),
        referral_reward_amount: String(get('referral_reward_amount', '1')),
        referral_max_daily: String(get('referral_max_daily', '50')),
        referral_fraud_protection: String(get('referral_fraud_protection', 'true')),
      };
      await adminSettingsApi.saveAppSettings(sectionSettings);

      queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin_settings_fees'] });
      queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
      setToastColor('success');
      setToastMessage('Wallet & Referral settings saved successfully');
      setShowToast(true);
      setInitialSnapshot(JSON.stringify({ settings, feeValues }));
    } catch (err: any) {
      setToastColor('danger');
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

  const renderField = (
    label: string,
    value: string,
    onChange: (val: string) => void,
    opts: { type?: string; placeholder?: string; currency?: boolean; rows?: number; min?: number; step?: string } = {}
  ) => (
    <div className="settings-field">
      <label>{label}</label>
      <div className="field-input-wrapper">
        {opts.currency && <span className="field-currency-badge">GH₵</span>}
        {opts.rows ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={opts.placeholder || ''}
            rows={opts.rows}
          />
        ) : (
          <input
            type={opts.type || 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={opts.placeholder || ''}
            min={opts.min}
            step={opts.step}
          />
        )}
      </div>
    </div>
  );

  return (
    <IonPage>
      <AdminLayout onRefresh={async () => {
        await queryClient.invalidateQueries({ queryKey: ['admin_settings'] });
        await queryClient.invalidateQueries({ queryKey: ['admin_settings_fees'] });
        await queryClient.invalidateQueries({ queryKey: ['admin_settings_afa'] });
        await queryClient.invalidateQueries({ queryKey: ['afa-pricing'] });
      }}>
        <div className="admin-settings-page">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <div className="page-title-row">
            <IonIcon icon={settingsOutline} className="page-icon" />
            <h1>Settings</h1>
            {isDirty && (
              <span className="unsaved-badge">
                <span className="unsaved-dot" />
                Unsaved changes
              </span>
            )}
          </div>
        </motion.div>

        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading settings...</span>
          </div>
        ) : isError ? (
          <div className="loading-state">
            <p>Failed to load settings. Please try again.</p>
            <IonButton fill="clear" onClick={() => refetch()}>Retry</IonButton>
          </div>
        ) : (
          <div className="settings-sections">

            {/* ── General ── */}
            <motion.div custom={0} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={settingsOutline} className="section-icon" />
                  </div>
                  <h2>General</h2>
                </div>
                <div className="settings-fields">
                  {renderField('Site Name', get('site_name', 'MTN AFA Registration'), (v) => set('site_name', v))}
                  {renderField('Support Email', get('support_email', 'support@mtn-afa.com'), (v) => set('support_email', v), { type: 'email' })}
                  {renderField('Support Phone', get('support_phone', '+233 50 000 0000'), (v) => set('support_phone', v))}
                  {renderField('Address', get('address', 'MTN Tower, Ridge Accra, Ghana'), (v) => set('address', v), { rows: 2 })}
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={() => saveSection('General', ['site_name', 'support_email', 'support_phone', 'address'])} disabled={saving === 'General'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'General' ? 'Saving...' : 'Save General'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

            {/* ── Registration Fees ── */}
            <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={pricetagOutline} className="section-icon" />
                  </div>
                  <h2>Registration Fees</h2>
                </div>
                <div className="settings-fields">
                  {renderField('Agent Registration Fee', feeValues['agent_fee'] ?? get('agent_fee', '100'), (v) => setFeeValue('agent_fee', v), { type: 'number', currency: true, min: 0, step: '0.1' })}
                  <div className="field-helper">
                    <IonIcon icon={informationCircleOutline} />
                    <span>The one-time fee a user pays to become an agent. Unrelated to the AFA registration price below.</span>
                  </div>
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={saveFees} disabled={saving === 'Fees'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Fees' ? 'Saving...' : 'Save Fees'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

            {/* ── AFA Registration Pricing ── */}
            <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={pricetagOutline} className="section-icon" />
                  </div>
                  <h2>AFA Registration Pricing</h2>
                </div>
                <div className="settings-fields">
                  {afaPricingError ? (
                    <div className="field-helper">
                      <IonIcon icon={informationCircleOutline} />
                      <span>Failed to load AFA pricing. Use the pull-to-refresh gesture and try again.</span>
                    </div>
                  ) : afaPricingLoading ? (
                    <div className="field-helper">
                      <IonIcon icon={informationCircleOutline} />
                      <span>Loading AFA pricing…</span>
                    </div>
                  ) : null}

                  {renderField('Normal User Price', afaValues.normal_price, (v) => setAfaValues(prev => ({ ...prev, normal_price: v })), { type: 'number', currency: true, min: 0, step: '0.01', placeholder: '0.00' })}
                  {renderField('Agent Price', afaValues.agent_price, (v) => setAfaValues(prev => ({ ...prev, agent_price: v })), { type: 'number', currency: true, min: 0, step: '0.01', placeholder: '0.00' })}
                  <div className="field-helper">
                    <IonIcon icon={informationCircleOutline} />
                    <span>
                      The price each account is charged is resolved on the server from its role at submit time.
                      Prices must be greater than 0, support up to 2 decimal places, and cannot exceed 1,000,000.00.
                    </span>
                  </div>
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={saveAfaPricing} disabled={saving === 'AFA Pricing' || !afaDirty}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'AFA Pricing' ? 'Saving...' : 'Save AFA Pricing'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

            {/* ── Wallet & Referral ── */}
            <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={walletOutline} className="section-icon" />
                  </div>
                  <h2>Wallet & Referral</h2>
                </div>
                <div className="settings-fields">
                  {renderField('Wallet Min Top-up', feeValues['wallet_min_topup'] ?? '', (v) => setFeeValue('wallet_min_topup', v), { type: 'number', currency: true, min: 0, step: '0.1' })}
                  {renderField('Wallet Max Top-up', feeValues['wallet_max_topup'] ?? '', (v) => setFeeValue('wallet_max_topup', v), { type: 'number', currency: true, min: 0, step: '0.1' })}
                  <div className="field-helper">
                    <IonIcon icon={informationCircleOutline} />
                    <span>Min Top-up must be less than Max Top-up</span>
                  </div>

                  <div className="settings-subsection">
                    <div className="settings-subsection-title">Referral Program</div>

                    <div className="settings-toggle-row">
                      <div className="settings-toggle-label">
                        <span>Enable Referral System</span>
                        <span>Allow users to earn rewards for referrals</span>
                      </div>
                      <IonToggle
                        checked={get('referral_enabled', 'true') === 'true'}
                        onIonChange={(e: any) => set('referral_enabled', e.detail.checked ? 'true' : 'false')}
                      />
                    </div>

                    {renderField('Reward Amount', get('referral_reward_amount', '1'), (v) => set('referral_reward_amount', v), { type: 'number', currency: true })}
                    {renderField('Max Daily Rewards', get('referral_max_daily', '50'), (v) => set('referral_max_daily', v), { type: 'number', currency: true })}

                    <div className="settings-toggle-row">
                      <div className="settings-toggle-label">
                        <span>Fraud Protection</span>
                        <span>Automatically detect and prevent fraudulent referrals</span>
                      </div>
                      <IonToggle
                        checked={get('referral_fraud_protection', 'true') === 'true'}
                        onIonChange={(e: any) => set('referral_fraud_protection', e.detail.checked ? 'true' : 'false')}
                      />
                    </div>
                  </div>
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={saveWalletReferral} disabled={saving === 'Wallet & Referral'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Wallet & Referral' ? 'Saving...' : 'Save Wallet & Referral'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

            {/* ── Notifications (WhatsApp + Email + SMS) ── */}
            <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={notificationsCircleOutline} className="section-icon" />
                  </div>
                  <h2>Notifications</h2>
                </div>
                <div className="settings-fields">

                  {/* WhatsApp */}
                  <div className="settings-subsection">
                    <div className="settings-subsection-title">
                      <IonIcon icon={logoWhatsapp} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                      WhatsApp
                    </div>

                    <div className="settings-toggle-row">
                      <div className="settings-toggle-label">
                        <span>Enable WhatsApp Button</span>
                        <span>Show WhatsApp chat button to users</span>
                      </div>
                      <IonToggle
                        checked={get('whatsapp_enabled', 'true') === 'true'}
                        onIonChange={(e: any) => set('whatsapp_enabled', e.detail.checked ? 'true' : 'false')}
                      />
                    </div>

                    {renderField('Support WhatsApp Number', get('whatsapp_user_number', '233501112222'), (v) => set('whatsapp_user_number', v), { placeholder: '233501112222' })}
                    {renderField('Agent WhatsApp Number', get('whatsapp_agent_number', '233501112222'), (v) => set('whatsapp_agent_number', v), { placeholder: '233501112222' })}
                    {renderField('Default User Message', get('whatsapp_user_message', 'Hello, I need help with my account.'), (v) => set('whatsapp_user_message', v), { rows: 2 })}
                    {renderField('Default Agent Message', get('whatsapp_agent_message', 'Hello, I am an agent and I need assistance.'), (v) => set('whatsapp_agent_message', v), { rows: 2 })}
                  </div>

                  {/* Email */}
                  <div className="settings-subsection">
                    <div className="settings-subsection-title">
                      <IonIcon icon={chatbubbleOutline} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                      Email
                    </div>
                    {renderField('Resend API Key', get('resend_api_key', ''), (v) => set('resend_api_key', v), { type: 'password', placeholder: 're_xxxxxxxxxxxx' })}
                    {renderField('From Email', get('email_from', 'noreply@mtn-afa.com'), (v) => set('email_from', v), { type: 'email', placeholder: 'noreply@yourdomain.com' })}
                  </div>

                  {/* SMS */}
                  <div className="settings-subsection">
                    <div className="settings-subsection-title">
                      <IonIcon icon={chatbubbleOutline} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                      SMS
                    </div>
                    {renderField('API URL', get('sms_api_url', ''), (v) => set('sms_api_url', v), { placeholder: 'https://api.example.com/sms/send' })}
                    {renderField('API Key', get('sms_api_key', ''), (v) => set('sms_api_key', v), { type: 'password', placeholder: 'sk_test_xxxx' })}
                    {renderField('Sender ID', get('sms_sender_id', 'MTN-AFA'), (v) => set('sms_sender_id', v), { placeholder: 'MTN-AFA' })}
                    <div className="field-helper">
                      <IonIcon icon={informationCircleOutline} />
                      <span>Supports any SMS provider with a JSON REST API that accepts <code>to</code>, <code>from</code>, <code>message</code> fields and Bearer token auth.</span>
                    </div>
                  </div>
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={() => saveSection('Notifications', [
                    'whatsapp_enabled', 'whatsapp_user_number', 'whatsapp_agent_number',
                    'whatsapp_user_message', 'whatsapp_agent_message',
                    'resend_api_key', 'email_from',
                    'sms_api_url', 'sms_api_key', 'sms_sender_id'
                  ])} disabled={saving === 'Notifications'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Notifications' ? 'Saving...' : 'Save Notifications'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

            {/* ── Agent System ── */}
            <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible">
              <Card variant="accent" noPadding className="settings-card">
                <div className="settings-card-header">
                  <div className="section-icon-wrapper">
                    <IonIcon icon={ribbonOutline} className="section-icon" />
                  </div>
                  <h2>Agent System</h2>
                </div>
                <div className="settings-fields">
                  <div className="settings-toggle-row">
                    <div className="settings-toggle-label">
                      <span>Enable Agent System</span>
                      <span>Allow users to register as agents</span>
                    </div>
                    <IonToggle
                      checked={get('agent_system_enabled', 'true') === 'true'}
                      onIonChange={(e: any) => set('agent_system_enabled', e.detail.checked ? 'true' : 'false')}
                    />
                  </div>

                  <div className="settings-toggle-row">
                    <div className="settings-toggle-label">
                      <span>Auto-Approve Agents</span>
                      <span>Automatically approve agent registrations without manual review</span>
                    </div>
                    <IonToggle
                      checked={get('agent_auto_approve', 'false') === 'true'}
                      onIonChange={(e: any) => set('agent_auto_approve', e.detail.checked ? 'true' : 'false')}
                    />
                  </div>

                  {renderField('Minimum Commission', get('agent_min_commission', '10'), (v) => set('agent_min_commission', v), { type: 'number', currency: true })}

                  <div className="settings-subsection">
                    <div className="settings-subsection-title">Push Notifications</div>
                    {renderField('VAPID Public Key', get('vapid_public_key', ''), (v) => set('vapid_public_key', v), { placeholder: 'BH7GpjPVgH...' })}
                    {renderField('VAPID Private Key', get('vapid_private_key', ''), (v) => set('vapid_private_key', v), { type: 'password', placeholder: 'dGVzdC12YXBpZC...' })}
                    <div className="field-helper">
                      <IonIcon icon={informationCircleOutline} />
                      <span>Generate keys via <code>npx web-push generate-vapid-keys</code></span>
                    </div>
                  </div>
                </div>
                <div className="section-save-row">
                  <IonButton className="section-save-btn" onClick={() => saveSection('Agent', [
                    'agent_system_enabled', 'agent_auto_approve', 'agent_min_commission',
                    'vapid_public_key', 'vapid_private_key'
                  ])} disabled={saving === 'Agent'}>
                    <IonIcon icon={saveOutline} slot="start" />
                    {saving === 'Agent' ? 'Saving...' : 'Save Agent Settings'}
                  </IonButton>
                </div>
              </Card>
            </motion.div>

          </div>
        )}
      </div>
    </AdminLayout>

      <IonToast
        isOpen={showToast}
        onDidDismiss={() => setShowToast(false)}
        message={toastMessage}
        duration={3000}
        position="top"
        color={toastColor}
      />
    </IonPage>
  );
};

export default SettingsPage;
