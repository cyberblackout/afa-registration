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
  IonCheckbox,
} from '@ionic/react';
import {
  eyeOutline,
  eyeOffOutline,
  arrowForward,
} from 'ionicons/icons';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import './Login.css';

const Login: React.FC = () => {
  const history = useHistory();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('remembered_email');
    const rememberMeFlag = localStorage.getItem('remember_me');
    if (saved) {
      setEmail(saved);
    }
    if (rememberMeFlag === 'true') {
      setRememberMe(true);
    } else if (rememberMeFlag === 'false') {
      setRememberMe(false);
    } else if (saved) {
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setToast({ show: true, message: 'Please fill in all fields' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message === 'Invalid login credentials') {
          throw new Error('Invalid email or password. Please try again.');
        }
        throw error;
      }
      if (data.user) {
        if (rememberMe) {
          localStorage.setItem('remembered_email', email);
          localStorage.setItem('remember_me', 'true');
        } else {
          localStorage.removeItem('remembered_email');
          localStorage.removeItem('remember_me');
        }
        const { data: profileRows } = await supabase.rpc('get_my_profile');
        const profile = profileRows?.[0] ?? null;
        const role = (profile?.role ?? 'user') as 'user' | 'agent' | 'admin';

        if (role === 'admin') {
          await supabase.auth.signOut();
          setToast({ show: true, message: 'Admin accounts must use the Admin Portal to sign in.' });
          setLoading(false);
          return;
        }

        setUser({
          id: data.user.id,
          email: data.user.email ?? '',
          full_name: profile?.full_name ?? data.user.email ?? '',
          username: profile?.username ?? '',
          phone: profile?.phone ?? '',
          role,
          avatar_url: profile?.avatar_url,
          wallet_balance: profile?.wallet_balance ?? 0,
          created_at: profile?.created_at ?? new Date().toISOString(),
        }, role);
        history.push(role === 'agent' ? '/agent/dashboard' : '/dashboard');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setToast({ show: true, message: error.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setResetEmail(email);
    setShowForgotModal(true);
  };

  const handleSendResetLink = async () => {
    if (!resetEmail.trim()) {
      setToast({ show: true, message: 'Please enter your email address' });
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setToast({ show: true, message: 'Password reset link sent to your email.' });
      setShowForgotModal(false);
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Failed to send reset link' });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="login-content" scrollY={false}>
        <div className="login-container">
          <div className="login-card">
            <div className="login-brand">
              <p className="login-brand-name">MTN AFA Portal</p>
              <div className="login-brand-divider" />
            </div>

            <div className="login-header">
              <IonText>
                <h1 className="login-welcome">Welcome back 👋</h1>
                <p className="login-subtitle">Sign in to continue to your MTN AFA Portal.</p>
              </IonText>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
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

              <div className="input-group">
                <IonLabel className="input-label">Password</IonLabel>
                <IonItem className="input-item" lines="none">
                  <IonInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onIonInput={(e) => setPassword(e.detail.value!)}
                    placeholder="Enter your password"
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

              <div className="login-options">
                <IonItem lines="none" className="login-remember">
                  <IonCheckbox
                    checked={rememberMe}
                    onIonChange={(e) => setRememberMe(e.detail.checked)}
                    slot="start"
                    style={{ '--checkbox-background-checked': '#ffc409', '--checkmark-color': '#1a1a2e' }}
                  />
                  <IonLabel>Remember me</IonLabel>
                </IonItem>
                <button
                  type="button"
                  className="link-btn"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </button>
              </div>

              <IonButton
                type="submit"
                expand="block"
                className={`login-button ${loading ? 'button-loading' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    LOGIN
                    <IonIcon icon={arrowForward} slot="end" />
                  </>
                )}
              </IonButton>
            </form>

            <div className="login-footer">
              <IonText>
                <p>
                  Don't have an account?{' '}
                  <button className="link-btn" onClick={() => history.push('/register')}>
                    Create an account
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
          color="danger"
        />

        {showForgotModal && (
          <div className="modal-overlay" onClick={() => setShowForgotModal(false)}>
            <div className="forgot-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Reset Password</h3>
              <p>Enter your email address to receive a password reset link.</p>
              <IonItem lines="none" className="input-item">
                <IonInput
                  type="email"
                  value={resetEmail}
                  onIonInput={(e) => setResetEmail(e.detail.value!)}
                  placeholder="you@example.com"
                />
              </IonItem>
              <div className="forgot-modal-actions">
                <IonButton fill="clear" onClick={() => setShowForgotModal(false)}>Cancel</IonButton>
                <IonButton className="login-button" onClick={handleSendResetLink} disabled={resetLoading}>
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </IonButton>
              </div>
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Login;
