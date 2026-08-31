import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonContent,
  IonPage,
  IonInput,
  IonButton,
  IonItem,
  IonLabel,
  IonText,
  IonIcon,
  IonToast,
} from '@ionic/react';
import { eyeOutline, eyeOffOutline, arrowForward } from 'ionicons/icons';
import { supabase } from '../services/supabase';
import './ResetPassword.css';

const ResetPassword: React.FC = () => {
  const history = useHistory();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [sessionReady, setSessionReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  useEffect(() => {
    const handleRecovery = async () => {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');

        if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('Session set error:', error);
            setToast({ show: true, message: 'Invalid or expired reset link. Please request a new one.' });
            setInitializing(false);
            return;
          }
          setSessionReady(true);
          setInitializing(false);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        setToast({ show: true, message: 'No valid reset session found. Please request a new reset link.' });
      }
      setInitializing(false);
    };

    handleRecovery();
  }, []);

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (newPassword && value && newPassword !== value) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    if (confirmPassword && value !== confirmPassword) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setToast({ show: true, message: 'Please fill in all fields' });
      return;
    }
    if (newPassword.length < 8) {
      setToast({ show: true, message: 'Password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMismatch(true);
      setToast({ show: true, message: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setToast({ show: true, message: 'Password updated successfully!' });
      setTimeout(() => {
        supabase.auth.signOut();
        history.push('/login');
      }, 2000);
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <IonPage>
        <IonContent className="reset-content" scrollY={false}>
          <div className="reset-container">
            <div className="reset-card">
              <div className="reset-brand">
                <p className="reset-brand-name">MTN AFA Portal</p>
                <div className="reset-brand-divider" />
              </div>
              <div className="reset-loading">Loading...</div>
            </div>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!sessionReady) {
    return (
      <IonPage>
        <IonContent className="reset-content" scrollY={false}>
          <div className="reset-container">
            <div className="reset-card">
              <div className="reset-brand">
                <p className="reset-brand-name">MTN AFA Portal</p>
                <div className="reset-brand-divider" />
              </div>
              <div className="reset-header">
                <IonText>
                  <h1 className="reset-welcome">Link Expired</h1>
                  <p className="reset-subtitle">
                    This password reset link is invalid or has expired.
                    Please request a new one from the login page.
                  </p>
                </IonText>
              </div>
              <IonButton
                expand="block"
                className="reset-button"
                onClick={() => history.push('/login')}
              >
                Back to Login
                <IonIcon icon={arrowForward} slot="end" />
              </IonButton>
            </div>
          </div>
          <IonToast
            isOpen={toast.show}
            message={toast.message}
            duration={4000}
            position="top"
            onDidDismiss={() => setToast({ show: false, message: '' })}
            color="danger"
          />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="reset-content" scrollY={false}>
        <div className="reset-container">
          <div className="reset-card">
            <div className="reset-brand">
              <p className="reset-brand-name">MTN AFA Portal</p>
              <div className="reset-brand-divider" />
            </div>

            <div className="reset-header">
              <IonText>
                <h1 className="reset-welcome">Reset Password</h1>
                <p className="reset-subtitle">Enter your new password below.</p>
              </IonText>
            </div>

            <form onSubmit={handleSubmit} className="reset-form">
              <div className="input-group">
                <IonLabel className="input-label">New Password</IonLabel>
                <IonItem className="input-item" lines="none">
                  <IonInput
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onIonInput={(e) => handlePasswordChange(e.detail.value!)}
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    <IonIcon icon={showNewPassword ? eyeOffOutline : eyeOutline} />
                  </button>
                </IonItem>
              </div>

              <div className="input-group">
                <IonLabel className="input-label">Confirm New Password</IonLabel>
                <IonItem
                  className={`input-item ${passwordMismatch ? 'input-error' : ''}`}
                  lines="none"
                >
                  <IonInput
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onIonInput={(e) => handleConfirmPasswordChange(e.detail.value!)}
                    placeholder="Confirm new password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <IonIcon icon={showConfirmPassword ? eyeOffOutline : eyeOutline} />
                  </button>
                </IonItem>
                {passwordMismatch && (
                  <IonText color="danger">
                    <small className="input-error-text">Passwords do not match.</small>
                  </IonText>
                )}
              </div>

              <IonButton
                type="submit"
                expand="block"
                className={`reset-button ${loading ? 'button-loading' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    UPDATE PASSWORD
                    <IonIcon icon={arrowForward} slot="end" />
                  </>
                )}
              </IonButton>
            </form>

            <div className="reset-footer">
              <IonText>
                <p>
                  Remember your password?{' '}
                  <button className="link-btn" onClick={() => history.push('/login')}>
                    Back to Login
                  </button>
                </p>
              </IonText>
            </div>
          </div>
        </div>

        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={4000}
          position="top"
          onDidDismiss={() => setToast({ show: false, message: '' })}
          color={toast.message.includes('updated') ? 'success' : 'danger'}
        />
      </IonContent>
    </IonPage>
  );
};

export default ResetPassword;
