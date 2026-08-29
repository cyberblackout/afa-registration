import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useIsAdmin } from './hooks/useData';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const RegisterAFAPage = lazy(() => import('./pages/RegisterAFAPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ReferralPage = lazy(() => import('./pages/ReferralPage'));
const BecomeAgentPage = lazy(() => import('./pages/BecomeAgentPage'));
const AgentDashboardPage = lazy(() => import('./pages/AgentDashboardPage'));
const AdminAgentManagement = lazy(() => import('./pages/admin/AgentManagementPage'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/DashboardPage'));
const AdminRegistrations = lazy(() => import('./pages/admin/RegistrationsPage'));
const AdminCustomers = lazy(() => import('./pages/admin/CustomersPage'));
const AdminWallet = lazy(() => import('./pages/admin/WalletPage'));
const AdminPayments = lazy(() => import('./pages/admin/PaymentsPage'));
const AdminOrders = lazy(() => import('./pages/admin/OrdersPage'));
const AdminNotifs = lazy(() => import('./pages/admin/NotificationsPage'));
const AdminReferrals = lazy(() => import('./pages/admin/ReferralManagementPage'));
const AdminReports = lazy(() => import('./pages/admin/ReportsPage'));
const AdminSettings = lazy(() => import('./pages/admin/SettingsPage'));

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/variables.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

setupIonicReact();

const LoadingSpinner: React.FC<{ message?: string }> = ({ message }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#0f0f1a',
      gap: '1rem',
    }}
  >
    <div
      style={{
        width: 40,
        height: 40,
        border: '3px solid rgba(255, 196, 9, 0.2)',
        borderTopColor: '#ffc409',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
    {message && (
      <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>{message}</p>
    )}
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
  </div>
);

const AuthErrorScreen: React.FC = () => {
  const { error } = useAuth();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0f0f1a',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: 400,
          padding: '2rem',
          borderRadius: 16,
          background: '#1a1a2e',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h2 style={{ color: '#fff', margin: '0 0 0.5rem', fontSize: '1.125rem' }}>
          Connection Issue
        </h2>
        <p style={{ color: '#9ca3af', margin: '0 0 1.5rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
          {error || 'Unable to connect to the server. Please check your internet connection.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.625rem 1.5rem',
            borderRadius: 10,
            border: 'none',
            background: '#ffc409',
            color: '#0f0f1a',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

const ProtectedRoute: React.FC<{
  component: React.FC<any>;
  path: string;
  exact?: boolean;
  requireAdmin?: boolean;
  requireRole?: 'user' | 'agent';
}> = ({ component: Component, requireAdmin, requireRole, ...rest }) => {
  const { isAuthenticated, isLoading: authLoading, role } = useAuthStore();
  const { loading: contextLoading, error: authError } = useAuth();

  const isLoading = authLoading || contextLoading;

  if (isLoading && !isAuthenticated) {
    return (
      <Route {...rest} render={() => <LoadingSpinner message="Signing in..." />} />
    );
  }

  if (authError && !isAuthenticated) {
    return (
      <Route {...rest} render={() => <AuthErrorScreen />} />
    );
  }

  if (!isAuthenticated) {
    return <Route {...rest} render={() => <Redirect to="/login" />} />;
  }

  if (requireAdmin) {
    return (
      <Route
        {...rest}
        render={(props) => (
          <AdminQueryGate component={Component} {...props} />
        )}
      />
    );
  }

  if (requireRole && role !== requireRole) {
    if (role === 'agent') return <Route {...rest} render={() => <Redirect to="/agent/dashboard" />} />;
    return <Route {...rest} render={() => <Redirect to="/dashboard" />} />;
  }

  return (
    <Route {...rest} render={(props) => <Component {...props} />} />
  );
};

const AdminQueryGate: React.FC<{ component: React.FC<any> } & any> = ({ component: Component, ...props }) => {
  const { role } = useAuthStore();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  if (role === 'admin') return <Component {...props} />;
  if (adminLoading) {
    return <LoadingSpinner message="Verifying access..." />;
  }
  if (!isAdmin) return <Redirect to="/dashboard" />;
  return <Component {...props} />;
};

const App: React.FC = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <IonApp>
          <IonReactRouter>
            <IonRouterOutlet>
              <ErrorBoundary>
                <Suspense fallback={<LoadingSpinner message="Loading..." />}>
                  <Route exact path="/login" component={Login} />
                  <Route exact path="/register" component={Register} />
                  <Route exact path="/cyberin" component={AdminLogin} />
                  <ProtectedRoute exact path="/dashboard" component={DashboardPage} requireRole="user" />
                  <ProtectedRoute exact path="/wallet" component={WalletPage} />
                  <ProtectedRoute exact path="/register-afa" component={RegisterAFAPage} />
                  <ProtectedRoute exact path="/orders" component={OrdersPage} />
                  <ProtectedRoute exact path="/profile" component={ProfilePage} />
                  <ProtectedRoute exact path="/notifications" component={NotificationsPage} />
                  <ProtectedRoute exact path="/referrals" component={ReferralPage} />
                  <ProtectedRoute exact path="/become-agent" component={BecomeAgentPage} requireRole="user" />
                  <ProtectedRoute exact path="/agent/dashboard" component={AgentDashboardPage} requireRole="agent" />
                  <ProtectedRoute exact path="/cyberin/dashboard" component={AdminDashboard} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/registrations" component={AdminRegistrations} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/customers" component={AdminCustomers} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/wallet" component={AdminWallet} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/payments" component={AdminPayments} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/orders" component={AdminOrders} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/notifications" component={AdminNotifs} requireAdmin />
                  <Route exact path="/cyberin/pricing">
                    <Redirect to="/cyberin/settings" />
                  </Route>
                  <ProtectedRoute exact path="/cyberin/referrals" component={AdminReferrals} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/agents" component={AdminAgentManagement} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/reports" component={AdminReports} requireAdmin />
                  <ProtectedRoute exact path="/cyberin/settings" component={AdminSettings} requireAdmin />
                  <Route exact path="/">
                    <Redirect to="/login" />
                  </Route>
                </Suspense>
              </ErrorBoundary>
            </IonRouterOutlet>
          </IonReactRouter>
        </IonApp>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
