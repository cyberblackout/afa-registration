import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonLoading, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useIsAdmin } from './hooks/useData';
import { AuthProvider } from './contexts/AuthContext';

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
import '@ionic/react/css/palettes/dark.system.css';

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

const ProtectedRoute: React.FC<{ component: React.FC<any>; path: string; exact?: boolean; requireAdmin?: boolean; requireRole?: 'user' | 'agent' }> = ({ component: Component, requireAdmin, requireRole, ...rest }) => {
  const { isAuthenticated, isLoading, role } = useAuthStore();

  return (
    <Route {...rest} render={(props) => {
      if (isLoading && !isAuthenticated) {
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <IonLoading isOpen />
          </div>
        );
      }

      if (!isAuthenticated) {
        return <Redirect to="/login" />;
      }

      if (requireAdmin) {
        return (
          <AdminQueryGate component={Component} {...props} />
        );
      }

      if (requireRole && role !== requireRole) {
        if (role === 'agent') return <Redirect to="/agent/dashboard" />;
        if (role === 'user') return <Redirect to="/dashboard" />;
        return <Redirect to="/dashboard" />;
      }

      return <Component {...props} />;
    }} />
  );
};

const AdminQueryGate: React.FC<{ component: React.FC<any> } & any> = ({ component: Component, ...props }) => {
  const { role } = useAuthStore();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  if (role === 'admin') return <Component {...props} />;
  if (adminLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <IonLoading isOpen />
      </div>
    );
  }
  if (!isAdmin) return <Redirect to="/dashboard" />;
  return <Component {...props} />;
};


const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><IonLoading isOpen /></div>}>
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
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
