import React, { useState } from 'react';
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
  IonLoading,
} from '@ionic/react';
import {
  eyeOutline,
  eyeOffOutline,
  arrowForward,
  checkmarkCircle,
} from 'ionicons/icons';
import { supabase } from '../services/supabase';
import { profileApi, referralApi } from '../services/api';
import './Register.css';

function getDeviceFingerprint(): string {
  const nav = window.navigator;
  const screen = window.screen;
  const parts = [
    nav.userAgent,
    nav.language,
    nav.platform,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ];
  const raw = parts.join('||');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

const Register: React.FC = () => {
  const history = useHistory();
  const params = new URLSearchParams(window.location.search);
  const refCode = params.get('ref') || '';
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [referralFailed, setReferralFailed] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    if (password && value && password !== value) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (confirmPassword && value !== confirmPassword) {
      setPasswordMismatch(true);
    } else {
      setPasswordMismatch(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !username || !phone || !email || !password || !confirmPassword) {
      setToast({ show: true, message: 'Please fill in all fields' });
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setToast({ show: true, message: 'Use local Ghana format only, example: 0241234567' });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      setToast({ show: true, message: 'Passwords do not match' });
      return;
    }
    if (password.length < 8) {
      setToast({ show: true, message: 'Password must be at least 8 characters' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            username,
            phone,
          },
        },
      });
      if (error) {
        if (error.message?.toLowerCase().includes('already registered') ||
            error.message?.toLowerCase().includes('already exists')) {
          setToast({ show: true, message: 'An account with this email already exists. Please sign in instead.' });
          setTimeout(() => history.push('/login'), 2500);
          return;
        }
        throw error;
      }
        if (data.user) {
        const deviceFingerprint = getDeviceFingerprint();

        await profileApi.update({
          user_id: data.user.id,
          full_name: fullName,
          username,
          phone,
        });

        if (refCode) {
          await referralApi.createReferral(refCode, deviceFingerprint).catch(() => {
            setReferralFailed(true);
          });
        }
      }
      const successMsg = referralFailed
        ? 'Account created! Your referral link could not be applied, but you can still sign in.'
        : 'Account created successfully! You can now sign in.';
      setToast({ show: true, message: successMsg });
      setTimeout(() => history.push('/login'), 2000);
    } catch (error: any) {
      setToast({ show: true, message: error.message || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="register-content" scrollY={true}>
        <div className="register-container">
          <div className="register-card">
            <div className="register-brand">
              <p className="register-brand-name">MTN AFA Portal</p>
              <div className="register-brand-divider" />
            </div>

            <div className="register-header">
              <IonText>
                <h1 className="register-welcome">Create your account</h1>
                <p className="register-subtitle">Register to access your MTN AFA Portal.</p>
              </IonText>
            </div>

            <form onSubmit={handleSubmit} className="register-form">
              <div className="input-group">
                <IonLabel className="input-label">Full Name</IonLabel>
                <IonItem className="input-item" lines="none">
                  <IonInput
                    type="text"
                    value={fullName}
                    onIonInput={(e) => setFullName(e.detail.value!)}
                    placeholder="Enter your full name"
                    required
                  />
                </IonItem>
              </div>

              <div className="input-group">
                <IonLabel className="input-label">Username</IonLabel>
                <IonItem className="input-item" lines="none">
                  <IonInput
                    type="text"
                    value={username}
                    onIonInput={(e) => setUsername(e.detail.value!)}
                    placeholder="Choose a username"
                    required
                  />
                </IonItem>
              </div>

              <div className="form-row">
                <div className="input-group">
                  <IonLabel className="input-label">Phone Number</IonLabel>
                  <IonItem className="input-item" lines="none">
                    <IonInput
                      type="tel"
                      value={phone}
                      onIonInput={(e) => setPhone(e.detail.value!)}
                      placeholder="024 XXX XXXX"
                      required
                    />
                  </IonItem>
                  <IonText color="medium">
                    <small className="input-hint">Ghana format, e.g. 0241234567</small>
                  </IonText>
                </div>

                <div className="input-group">
                  <IonLabel className="input-label">Email Address</IonLabel>
                  <IonItem className="input-item" lines="none">
                    <IonInput
                      type="email"
                      value={email}
                      onIonInput={(e) => setEmail(e.detail.value!)}
                      placeholder="you@example.com"
                      required
                    />
                  </IonItem>
                </div>
              </div>

              <div className="input-group">
                <IonLabel className="input-label">Password</IonLabel>
                <IonItem className="input-item" lines="none">
                  <IonInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onIonInput={(e) => handlePasswordChange(e.detail.value!)}
                    placeholder="Create a password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                  </button>
                </IonItem>
              </div>

              <div className="input-group">
                <IonLabel className="input-label">Confirm Password</IonLabel>
                <IonItem
                  className={`input-item ${passwordMismatch ? 'input-error' : ''}`}
                  lines="none"
                >
                  <IonInput
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onIonInput={(e) => handleConfirmPasswordChange(e.detail.value!)}
                    placeholder="Confirm your password"
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

              <div className="password-hints">
                <div className={`hint ${password.length >= 8 ? 'met' : ''}`}>
                  <IonIcon icon={checkmarkCircle} />
                  <span>At least 8 characters</span>
                </div>
              </div>

              <IonButton
                type="submit"
                expand="block"
                className="register-button"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'CREATE ACCOUNT'}
                {!loading && <IonIcon icon={arrowForward} slot="end" />}
              </IonButton>
            </form>

            <div className="register-footer">
              <IonText>
                <p>
                  Already have an account?{' '}
                  <button className="link-btn" onClick={() => history.push('/login')}>
                    Login
                  </button>
                </p>
              </IonText>
            </div>
          </div>
        </div>

        <IonLoading isOpen={loading} message="Creating account..." />
        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={3000}
          onDidDismiss={() => setToast({ show: false, message: '' })}
          color={toast.message.includes('created') ? 'success' : 'danger'}
        />
      </IonContent>
    </IonPage>
  );
};

export default Register;
