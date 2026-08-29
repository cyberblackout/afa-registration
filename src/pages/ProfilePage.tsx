import React, { useRef, useState, useEffect } from 'react';
import {
  IonPage,
  IonIcon,
  IonToast,
} from '@ionic/react';
import {
  personOutline,
  callOutline,
  mailOutline,
  locationOutline,
  cameraOutline,
  lockClosedOutline,
  checkmarkOutline,
  closeOutline,
  eyeOutline,
  eyeOffOutline,
  notificationsOutline,
  moonOutline,
  ribbonOutline,
  arrowForward,
  shieldCheckmarkOutline,
  sunnyOutline,
  keyOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../services/database';
import { supabase } from '../services/supabase';
import { profileApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useHistory, Link } from 'react-router-dom';
import { formatGhanaDate } from '../utils/date';
import DashboardLayout from '../layouts/DashboardLayout';
import './ProfilePage.css';

const profileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  address: z.string().min(5, 'Address must be at least 5 characters'),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine(
  (data) => {
    if (data.newPassword && data.newPassword !== data.confirmPassword) {
      return false;
    }
    return true;
  },
  { message: 'Passwords do not match', path: ['confirmPassword'] }
).refine(
  (data) => {
    if (data.newPassword && !data.currentPassword) {
      return false;
    }
    return true;
  },
  { message: 'Current password is required to set a new password', path: ['currentPassword'] }
);

type ProfileFormData = z.infer<typeof profileSchema>;

const ProfilePage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const { isDark, toggle: toggleDark } = useThemeStore();
  const queryClient = useQueryClient();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  usePushNotifications(pushNotifications);

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      return await profileApi.get(user!.id);
    },
    enabled: !!user?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      address: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      if (profile.avatar_url) {
        setAvatarPreview(profile.avatar_url);
      }
      const prefs = profile.notification_preferences || {};
      setEmailNotifications(prefs.email ?? true);
      setSmsNotifications(prefs.sms ?? true);
      setPushNotifications(prefs.push ?? false);
      setMarketingEmails(prefs.marketing ?? false);
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      if (avatarFile) {
        await db.uploadAvatar(user!.id, avatarFile);
      }

      await db.updateProfile(user!.id, {
        full_name: data.fullName,
        phone: data.phone,
      });

      const notifPrefs = {
        email: emailNotifications,
        sms: smsNotifications,
        push: pushNotifications,
        marketing: marketingEmails,
      };
      await profileApi.update({ user_id: user!.id, notification_preferences: notifPrefs });

      if (data.newPassword) {
        const { error: pwError } = await supabase.auth.updateUser({
          password: data.newPassword,
        });
        if (pwError) throw pwError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setToastMessage('Profile updated successfully!');
      setToastColor('success');
      setShowToast(true);
    },
    onError: (err: any) => {
      setToastMessage(err.message || 'Failed to update profile');
      setToastColor('danger');
      setShowToast(true);
    },
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCancel = () => {
    if (profile) {
      reset({
        fullName: profile.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
    setAvatarPreview(profile?.avatar_url || null);
    setAvatarFile(null);
  };

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <IonPage>
      <DashboardLayout onRefresh={handleRefresh}>
        <motion.div
          className="profile-page"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {isLoading ? (
            <div className="profile-loading">
              <div className="profile-loading-spinner" />
              <span>Loading profile...</span>
            </div>
          ) : isError ? (
            <div className="profile-error">
              <IonIcon icon={alertCircleOutline} />
              <p>Failed to load profile.</p>
              <button onClick={handleRefresh}>Retry</button>
            </div>
          ) : (
            <div className="profile-layout">
              {/* ── LEFT COLUMN ── */}
              <div className="profile-col-main">
                {/* ── PROFILE HEADER ── */}
                <div className="pf-header">
                  <div className="pf-avatar-area">
                    <div className="pf-avatar" onClick={handleAvatarClick} role="button" tabIndex={0} aria-label="Change profile photo">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Profile" />
                      ) : (
                        <IonIcon icon={personOutline} className="pf-avatar-icon" />
                      )}
                    </div>
                    <button type="button" className="pf-avatar-edit" onClick={handleAvatarClick} aria-label="Upload photo">
                      <IonIcon icon={cameraOutline} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      hidden
                    />
                  </div>
                  <div className="pf-identity">
                    <h1 className="pf-name">{profile?.full_name || user?.email?.split('@')[0] || 'User'}</h1>
                    <p className="pf-email">{user?.email || ''}</p>
                    {profile?.role && (
                      <span className={`pf-role-badge pf-role-badge--${profile.role}`}>
                        <IonIcon icon={ribbonOutline} />
                        {profile.role === 'agent' ? 'Agent' : 'Member'}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── PERSONAL INFORMATION ── */}
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="pf-section">
                    <div className="pf-section-header">
                      <IonIcon icon={personOutline} />
                      <div>
                        <h2>Personal Information</h2>
                        <p>Your account details</p>
                      </div>
                    </div>

                    <div className="pf-fields">
                      <div className="pf-field">
                        <label className="pf-label" htmlFor="fullName">
                          <IonIcon icon={personOutline} />
                          Full Name
                        </label>
                        <input
                          id="fullName"
                          {...register('fullName')}
                          className={`pf-input ${errors.fullName ? 'pf-input--error' : ''}`}
                          placeholder="Enter your full name"
                        />
                        {errors.fullName && <span className="pf-error">{errors.fullName.message}</span>}
                      </div>

                      <div className="pf-field">
                        <label className="pf-label" htmlFor="phone">
                          <IonIcon icon={callOutline} />
                          Phone Number
                        </label>
                        <input
                          id="phone"
                          {...register('phone')}
                          className={`pf-input ${errors.phone ? 'pf-input--error' : ''}`}
                          placeholder="Enter your phone number"
                          type="tel"
                          inputMode="numeric"
                        />
                        {errors.phone && <span className="pf-error">{errors.phone.message}</span>}
                      </div>

                      <div className="pf-field">
                        <label className="pf-label" htmlFor="email">
                          <IonIcon icon={mailOutline} />
                          Email Address
                        </label>
                        <input
                          id="email"
                          className="pf-input pf-input--disabled"
                          value={user?.email || ''}
                          disabled
                          readOnly
                        />
                      </div>

                      <div className="pf-field pf-field--full">
                        <label className="pf-label" htmlFor="address">
                          <IonIcon icon={locationOutline} />
                          Address
                        </label>
                        <textarea
                          id="address"
                          {...register('address')}
                          className={`pf-input pf-textarea ${errors.address ? 'pf-input--error' : ''}`}
                          placeholder="Enter your address"
                          rows={3}
                        />
                        {errors.address && <span className="pf-error">{errors.address.message}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ── SECURITY ── */}
                  <div className="pf-section">
                    <div className="pf-section-header">
                      <IonIcon icon={shieldCheckmarkOutline} />
                      <div>
                        <h2>Security</h2>
                        <p>Update your password to keep your account secure</p>
                      </div>
                    </div>

                    <div className="pf-fields">
                      <div className="pf-field">
                        <label className="pf-label" htmlFor="currentPassword">
                          <IonIcon icon={lockClosedOutline} />
                          Current Password
                        </label>
                        <div className="pf-input-wrap">
                          <input
                            id="currentPassword"
                            {...register('currentPassword')}
                            className={`pf-input pf-input--password ${errors.currentPassword ? 'pf-input--error' : ''}`}
                            placeholder="Enter current password"
                            type={showCurrentPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            className="pf-eye-btn"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                          >
                            <IonIcon icon={showCurrentPassword ? eyeOffOutline : eyeOutline} />
                          </button>
                        </div>
                        {errors.currentPassword && <span className="pf-error">{errors.currentPassword.message}</span>}
                      </div>

                      <div className="pf-field">
                        <label className="pf-label" htmlFor="newPassword">
                          <IonIcon icon={keyOutline} />
                          New Password
                        </label>
                        <div className="pf-input-wrap">
                          <input
                            id="newPassword"
                            {...register('newPassword')}
                            className={`pf-input pf-input--password ${errors.newPassword ? 'pf-input--error' : ''}`}
                            placeholder="Enter new password"
                            type={showNewPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="pf-eye-btn"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          >
                            <IonIcon icon={showNewPassword ? eyeOffOutline : eyeOutline} />
                          </button>
                        </div>
                        {errors.newPassword && <span className="pf-error">{errors.newPassword.message}</span>}
                      </div>

                      <div className="pf-field">
                        <label className="pf-label" htmlFor="confirmPassword">
                          <IonIcon icon={lockClosedOutline} />
                          Confirm Password
                        </label>
                        <div className="pf-input-wrap">
                          <input
                            id="confirmPassword"
                            {...register('confirmPassword')}
                            className={`pf-input pf-input--password ${errors.confirmPassword ? 'pf-input--error' : ''}`}
                            placeholder="Confirm new password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="pf-eye-btn"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                          </button>
                        </div>
                        {errors.confirmPassword && <span className="pf-error">{errors.confirmPassword.message}</span>}
                      </div>
                    </div>
                  </div>

                  {/* ── ACTIONS ── */}
                  <div className="pf-actions">
                    <button type="button" className="pf-btn pf-btn--cancel" onClick={handleCancel}>
                      <IonIcon icon={closeOutline} />
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="pf-btn pf-btn--save"
                      disabled={updateMutation.isPending}
                    >
                      <IonIcon icon={checkmarkOutline} />
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div className="pf-col-side">
                {/* ── NOTIFICATION PREFERENCES ── */}
                <div className="pf-section">
                  <div className="pf-section-header">
                    <IonIcon icon={notificationsOutline} />
                    <div>
                      <h2>Notifications</h2>
                      <p>Choose how you receive updates</p>
                    </div>
                  </div>

                  <div className="pf-prefs">
                    {[
                      { icon: mailOutline, label: 'Email Notifications', desc: 'Receive updates via email', value: emailNotifications, set: setEmailNotifications },
                      { icon: notificationsOutline, label: 'SMS Notifications', desc: 'Get text message alerts', value: smsNotifications, set: setSmsNotifications },
                      { icon: notificationsOutline, label: 'Push Notifications', desc: 'In-app push alerts', value: pushNotifications, set: setPushNotifications },
                      { icon: mailOutline, label: 'Marketing Emails', desc: 'Promotional content', value: marketingEmails, set: setMarketingEmails },
                    ].map((item) => (
                      <div key={item.label} className="pf-pref-row">
                        <div className="pf-pref-left">
                          <div className="pf-pref-icon">
                            <IonIcon icon={item.icon} />
                          </div>
                          <div className="pf-pref-text">
                            <span className="pf-pref-label">{item.label}</span>
                            <span className="pf-pref-desc">{item.desc}</span>
                          </div>
                        </div>
                        <label className="pf-toggle" aria-label={item.label}>
                          <input
                            type="checkbox"
                            checked={item.value}
                            onChange={(e) => item.set(e.target.checked)}
                          />
                          <span className="pf-toggle-track">
                            <span className="pf-toggle-thumb" />
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── APPEARANCE ── */}
                <div className="pf-section">
                  <div className="pf-section-header">
                    <IonIcon icon={isDark ? moonOutline : sunnyOutline} />
                    <div>
                      <h2>Appearance</h2>
                      <p>Switch between light and dark mode</p>
                    </div>
                  </div>

                  <div className="pf-prefs">
                    <div className="pf-pref-row">
                      <div className="pf-pref-left">
                        <div className="pf-pref-icon">
                          <IonIcon icon={isDark ? moonOutline : sunnyOutline} />
                        </div>
                        <div className="pf-pref-text">
                          <span className="pf-pref-label">{isDark ? 'Dark Mode' : 'Light Mode'}</span>
                          <span className="pf-pref-desc">{isDark ? 'Night theme active' : 'Day theme active'}</span>
                        </div>
                      </div>
                      <label className="pf-toggle" aria-label="Toggle dark mode">
                        <input
                          type="checkbox"
                          checked={isDark}
                          onChange={toggleDark}
                        />
                        <span className="pf-toggle-track">
                          <span className="pf-toggle-thumb" />
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* ── AGENT PROGRAM ── */}
                <div className="pf-section">
                  {profile?.role === 'agent' ? (
                    <>
                      <div className="pf-section-header">
                        <IonIcon icon={ribbonOutline} />
                        <div>
                          <h2>Agent Program</h2>
                          <p>Your agent account</p>
                        </div>
                      </div>
                      <div className="pf-agent-info">
                        <div className="pf-agent-badges">
                          <span className={`pf-badge pf-badge--${profile.agent_status}`}>
                            {profile.agent_status === 'active' ? 'Active' : profile.agent_status === 'suspended' ? 'Suspended' : 'Inactive'}
                          </span>
                          {profile.agent_verified && (
                            <span className="pf-badge pf-badge--verified">
                              <IonIcon icon={checkmarkOutline} /> Verified
                            </span>
                          )}
                        </div>
                        {profile.agent_id && (
                          <div className="pf-agent-detail">
                            <span>Agent ID</span>
                            <code>{profile.agent_id}</code>
                          </div>
                        )}
                        {profile.agent_since && (
                          <div className="pf-agent-detail">
                            <span>Member since</span>
                            <span>{formatGhanaDate(profile.agent_since)}</span>
                          </div>
                        )}
                        <Link to="/agent/dashboard" className="pf-btn pf-btn--agent">
                          Go to Agent Dashboard <IonIcon icon={arrowForward} />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="pf-section-header">
                        <IonIcon icon={ribbonOutline} />
                        <div>
                          <h2>Agent Program</h2>
                          <p>Grow your business with MTN AFA</p>
                        </div>
                      </div>
                      <div className="pf-agent-cta">
                        <p>Become an agent and unlock discounted pricing, earn commissions, and grow your business.</p>
                        <Link to="/become-agent" className="pf-btn pf-btn--agent">
                          Become an Agent <IonIcon icon={arrowForward} />
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={3000}
          position="bottom"
          color={toastColor}
          className="custom-toast"
        />
      </DashboardLayout>
    </IonPage>
  );
};

export default ProfilePage;
