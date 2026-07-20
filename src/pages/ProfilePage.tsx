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
} from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../services/database';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useHistory, Link } from 'react-router-dom';
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

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

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
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      if (avatarFile) {
        const { error: uploadError } = await db.uploadAvatar(user!.id, avatarFile);
        if (uploadError) throw uploadError;
      }

      const { error } = await db.updateProfile(user!.id, {
        full_name: data.fullName,
        phone: data.phone,
      });
      if (error) throw error;

      const notifPrefs = {
        email: emailNotifications,
        sms: smsNotifications,
        push: pushNotifications,
        marketing: marketingEmails,
      };
      const { error: notifError } = await supabase.from('profiles').update({ notification_preferences: notifPrefs }).eq('id', user!.id);
      if (notifError) throw notifError;

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
      <DashboardLayout>
        <motion.div
          className="profile-page"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
            {isLoading ? (
              <div className="loading-state">
                <p>Loading profile...</p>
              </div>
            ) : (
              <>
                <div className="profile-header">
                  <h1>Personal Information</h1>
                  <p>Manage your account details and preferences</p>
                </div>

                <div className="profile-card">
                  <div className="avatar-section">
                    <div className="avatar-wrapper">
                      <div className="avatar-circle" onClick={handleAvatarClick}>
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Profile" />
                        ) : (
                          <IonIcon icon={personOutline} className="avatar-placeholder-icon" />
                        )}
                      </div>
                      <button type="button" className="avatar-edit-btn" onClick={handleAvatarClick}>
                        <IonIcon icon={cameraOutline} />
                      </button>
                    </div>
                    <div className="avatar-info">
                      <h3>{profile?.full_name || user?.email?.split('@')[0] || 'User'}</h3>
                      <p>{user?.email || ''}</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      hidden
                    />
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <div className="input-wrapper">
                          <IonIcon icon={personOutline} className="input-icon" />
                          <input
                            {...register('fullName')}
                            className={`profile-input ${errors.fullName ? 'error' : ''}`}
                            placeholder="Enter your full name"
                          />
                        </div>
                        {errors.fullName && <span className="error-text">{errors.fullName.message}</span>}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <div className="input-wrapper">
                          <IonIcon icon={callOutline} className="input-icon" />
                          <input
                            {...register('phone')}
                            className={`profile-input ${errors.phone ? 'error' : ''}`}
                            placeholder="Enter your phone number"
                            type="tel"
                          />
                        </div>
                        {errors.phone && <span className="error-text">{errors.phone.message}</span>}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div className="input-wrapper">
                          <IonIcon icon={mailOutline} className="input-icon" />
                          <input
                            className="profile-input"
                            value={user?.email || ''}
                            disabled
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Address</label>
                        <div className="input-wrapper">
                          <IonIcon icon={locationOutline} className="input-icon" />
                          <textarea
                            {...register('address')}
                            className={`profile-input textarea ${errors.address ? 'error' : ''}`}
                            placeholder="Enter your address"
                            rows={3}
                          />
                        </div>
                        {errors.address && <span className="error-text">{errors.address.message}</span>}
                      </div>
                    </div>

                    <div className="password-section">
                      <h3>Change Password</h3>
                      <div className="password-row">
                        <div className="form-group">
                          <label className="form-label">Current Password</label>
                          <div className="input-wrapper">
                            <IonIcon icon={lockClosedOutline} className="input-icon" />
                            <input
                              {...register('currentPassword')}
                              className={`profile-input ${errors.currentPassword ? 'error' : ''}`}
                              placeholder="Current password"
                              type={showCurrentPassword ? 'text' : 'password'}
                            />
                            <button
                              type="button"
                              className="input-suffix-btn"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              tabIndex={-1}
                            >
                              <IonIcon icon={showCurrentPassword ? eyeOffOutline : eyeOutline} />
                            </button>
                          </div>
                          {errors.currentPassword && <span className="error-text">{errors.currentPassword.message}</span>}
                        </div>

                        <div className="form-group">
                          <label className="form-label">New Password</label>
                          <div className="input-wrapper">
                            <IonIcon icon={lockClosedOutline} className="input-icon" />
                            <input
                              {...register('newPassword')}
                              className={`profile-input ${errors.newPassword ? 'error' : ''}`}
                              placeholder="New password"
                              type={showNewPassword ? 'text' : 'password'}
                            />
                            <button
                              type="button"
                              className="input-suffix-btn"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              tabIndex={-1}
                            >
                              <IonIcon icon={showNewPassword ? eyeOffOutline : eyeOutline} />
                            </button>
                          </div>
                          {errors.newPassword && <span className="error-text">{errors.newPassword.message}</span>}
                        </div>

                        <div className="form-group">
                          <label className="form-label">Confirm Password</label>
                          <div className="input-wrapper">
                            <IonIcon icon={lockClosedOutline} className="input-icon" />
                            <input
                              {...register('confirmPassword')}
                              className={`profile-input ${errors.confirmPassword ? 'error' : ''}`}
                              placeholder="Confirm password"
                              type={showConfirmPassword ? 'text' : 'password'}
                            />
                            <button
                              type="button"
                              className="input-suffix-btn"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              tabIndex={-1}
                            >
                              <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                            </button>
                          </div>
                          {errors.confirmPassword && <span className="error-text">{errors.confirmPassword.message}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="action-bar">
                      <button type="button" className="btn-cancel" onClick={handleCancel}>
                        <IonIcon icon={closeOutline} />
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-save"
                        disabled={updateMutation.isPending}
                      >
                        <IonIcon icon={checkmarkOutline} />
                        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="profile-card second-card">
                  <div className="notif-prefs-header">
                    <IonIcon icon={notificationsOutline} className="notif-prefs-icon" />
                    <div className="avatar-info">
                      <h3 style={{ margin: 0 }}>Notification Preferences</h3>
                      <p style={{ margin: '2px 0 0' }}>Choose how you receive updates</p>
                    </div>
                  </div>

                  <div className="notif-toggle-list">
                    {[
                      { label: 'Email Notifications', value: emailNotifications, set: setEmailNotifications },
                      { label: 'SMS Notifications', value: smsNotifications, set: setSmsNotifications },
                      { label: `Push Notifications`, value: pushNotifications, set: setPushNotifications },
                      { label: 'Marketing Emails', value: marketingEmails, set: setMarketingEmails },
                    ].map((item) => (
                      <div key={item.label} className="toggle-row">
                        <span className="toggle-label">{item.label}</span>
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={item.value}
                            onChange={(e) => item.set(e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="dark-mode-section">
                    <div className="toggle-row">
                      <div className="dark-mode-left">
                        <IonIcon icon={moonOutline} className="dark-mode-icon" />
                        <span className="toggle-label">Dark Mode</span>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={isDark}
                          onChange={toggleDark}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Agent section */}
                  <div className="agent-profile-section">
                    <div className="agent-profile-header">
                      <IonIcon icon={ribbonOutline} className="agent-profile-icon" />
                      <h3>Agent Program</h3>
                    </div>
                    {profile?.role === 'agent' ? (
                      <div className="agent-profile-info">
                        <div className="agent-badge-row">
                          <span className={`agent-status-badge ${profile.agent_status}`}>
                            {profile.agent_status === 'active' ? 'Active' : profile.agent_status === 'suspended' ? 'Suspended' : 'Inactive'}
                          </span>
                          {profile.agent_verified && <span className="agent-verified-badge">✓ Verified</span>}
                        </div>
                        {profile.agent_id && (
                          <div className="agent-id-display">
                            <span>Agent ID:</span>
                            <code>{profile.agent_id}</code>
                          </div>
                        )}
                        {profile.agent_since && (
                          <div className="agent-since-display">
                            <span>Agent since:</span>
                            <span>{new Date(profile.agent_since).toLocaleDateString()}</span>
                          </div>
                        )}
                        <Link to="/agent/dashboard" className="agent-dashboard-link">
                          Go to Agent Dashboard <IonIcon icon={arrowForward} />
                        </Link>
                      </div>
                    ) : (
                      <div className="agent-profile-cta">
                        <p>Become an agent and unlock discounted pricing, earn commissions, and grow your business.</p>
                        <Link to="/become-agent" className="become-agent-link">
                          <IonIcon icon={shieldCheckmarkOutline} />
                          Become an Agent
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </>
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