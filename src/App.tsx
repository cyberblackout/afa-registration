import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonLoading, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useIsAdmin } from './hooks/useData';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import DashboardPage from './pages/DashboardPage';
import WalletPage from './pages/WalletPage';
import RegisterAFAPage from './pages/RegisterAFAPage';
import OrdersPage from './pages/OrdersPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import ReferralPage from './pages/ReferralPage';
import BecomeAgentPage from './pages/BecomeAgentPage';
import AgentDashboardPage from './pages/AgentDashboardPage';
import AdminAgentManagement from './pages/admin/AgentManagementPage';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/DashboardPage';
import AdminRegistrations from './pages/admin/RegistrationsPage';
import AdminCustomers from './pages/admin/CustomersPage';
import AdminWallet from './pages/admin/WalletPage';
import AdminPayments from './pages/admin/PaymentsPage';
import AdminOrders from './pages/admin/OrdersPage';
import AdminPricing from './pages/admin/PricingPage';
import AdminNotifs from './pages/admin/NotificationsPage';
import AdminReferrals from './pages/admin/ReferralManagementPage';
import AdminReports from './pages/admin/ReportsPage';
import AdminSettings from './pages/admin/SettingsPage';

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
          <ProtectedRoute exact path="/cyberin/pricing" component={AdminPricing} requireAdmin />
          <ProtectedRoute exact path="/cyberin/notifications" component={AdminNotifs} requireAdmin />
          <ProtectedRoute exact path="/cyberin/referrals" component={AdminReferrals} requireAdmin />
          <ProtectedRoute exact path="/cyberin/agents" component={AdminAgentManagement} requireAdmin />
          <ProtectedRoute exact path="/cyberin/reports" component={AdminReports} requireAdmin />
          <ProtectedRoute exact path="/cyberin/settings" component={AdminSettings} requireAdmin />
          <Route exact path="/">
            <Redirect to="/login" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
