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
} from '@ionic/react';
import { shieldCheckmarkOutline, eyeOutline, eyeOffOutline, arrowForward } from 'ionicons/icons';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { db } from '../../services/database';
import { useAuthStore } from '../../store/authStore';
import './AdminLogin.css';

const AdminLogin: React.FC = () => {
  const history = useHistory();
  const queryClient = useQueryClient();
  const { setUser, setRole } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setToast({ show: true, message: 'Please fill in all fields' });
      return;
    }
    setLoading(true);
    try {
      // Sign in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned');

      // Verify session is active before querying
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session not established');

      // Fetch profile via SECURITY DEFINER RPC (bypasses RLS for reliability)
      const { data: profileRows, error: profileError } = await supabase.rpc('get_my_profile');
      
      if (profileError) {
        console.error('Profile fetch error:', profileError);
        await supabase.auth.signOut();
        setToast({ show: true, message: `Profile error: ${profileError.message}` });
        setLoading(false);
        return;
      }
      
      const profile = profileRows?.[0] ?? null;
      if (!profile) {
        await supabase.auth.signOut();
        setToast({ show: true, message: 'Profile not found. Contact support.' });
        setLoading(false);
        return;
      }

      // Check admin role - uses SECURITY DEFINER function (bypasses RLS)
      const { data: adminCheck, error: adminError } = await db.isAdmin();
      if (adminError) {
        console.error('Admin check error:', adminError);
        await supabase.auth.signOut();
        setToast({ show: true, message: `Admin check failed: ${adminError.message}` });
        setLoading(false);
        return;
      }
      if (!adminCheck) {
        await supabase.auth.signOut();
        setToast({ show: true, message: 'Access denied. Admin only.' });
        setLoading(false);
        return;
      }
      setUser({
        id: authData.user.id,
        email: authData.user.email!,
        full_name: profile.full_name ?? authData.user.email!,
        username: profile.username ?? '',
        phone: profile.phone ?? '',
        role: 'admin',
        avatar_url: profile.avatar_url,
        wallet_balance: profile.wallet_balance ?? 0,
        created_at: profile.created_at ?? new Date().toISOString(),
      }, 'admin');
      setRole('admin');
      // Pre-populate the isAdmin cache so ProtectedRoute renders instantly
      queryClient.setQueryData(['isAdmin', authData.user.id], true);
      history.push('/cyberin/dashboard');
    } catch (err: any) {
      setToast({ show: true, message: err.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="admin-login-content" scrollY={true}>
        <div className="admin-login-container">
          <motion.div
            className="admin-login-card"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="admin-login-header">
              <div className="admin-login-icon">
                <IonIcon icon={shieldCheckmarkOutline} />
              </div>
              <IonText>
                <h1>Admin Portal</h1>
                <p>MTN AFA - Super Admin Dashboard</p>
              </IonText>
            </div>

            <form onSubmit={handleSubmit} className="admin-login-form">
              <div className="admin-input-group">
                <IonLabel className="admin-input-label">Email Address</IonLabel>
                <IonItem className="admin-input-item" lines="none">
                  <IonInput
                    type="email"
                    value={email}
                    onIonInput={(e) => setEmail(e.detail.value!)}
                    placeholder="admin@afa.com"
                    required
                  />
                </IonItem>
              </div>

              <div className="admin-input-group">
                <IonLabel className="admin-input-label">Password</IonLabel>
                <IonItem className="admin-input-item" lines="none">
                  <IonInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onIonInput={(e) => setPassword(e.detail.value!)}
                    placeholder="Enter password"
                    required
                  />
                  <button type="button" className="admin-password-toggle" onClick={() => setShowPassword(!showPassword)}>
                    <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                  </button>
                </IonItem>
              </div>

              <IonButton type="submit" expand="block" className={`admin-login-btn ${loading ? 'button-loading' : ''}`} disabled={loading}>
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    Sign In
                    <IonIcon icon={arrowForward} slot="end" />
                  </>
                )}
              </IonButton>
            </form>

            <div className="admin-login-footer">
              <a href="/login" className="admin-back-link">← Back to Customer Portal</a>
            </div>
          </motion.div>
        </div>

        <IonToast isOpen={toast.show} message={toast.message} duration={3000} onDidDismiss={() => setToast({ show: false, message: '' })} color="danger" />
      </IonContent>
    </IonPage>
  );
};

export default AdminLogin;
