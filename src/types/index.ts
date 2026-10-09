export type UserRole = 'user' | 'agent' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  username: string;
  phone: string;
  role: UserRole;
  avatar_url?: string;
  wallet_balance: number;
  referral_code?: string;
  referred_by?: string;
  agent_id?: string;
  agent_since?: string;
  agent_status?: 'active' | 'inactive' | 'suspended';
  agent_verified?: boolean;
  notification_preferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    marketing?: boolean;
  };
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  username: string;
  phone: string;
  role: UserRole;
  avatar_url?: string;
  wallet_balance: number;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface Order {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  status: 'pending' | 'processing' | 'document_verification' | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'failed';
  payment_method?: string;
  payment_status?: string;
  payment_reference?: string;
  payment_date?: string;
  source_type?: string;
  source_id?: string;
  admin_id?: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string; email: string; phone: string };
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  reference?: string;
  payment_method?: string;
  status: string;
  created_at: string;
}

export interface RegistrationFormData {
  customer: {
    fullName: string;
    phone: string;
    email: string;
    dateOfBirth: string;
    gender: string;
    occupation: string;
    address: string;
    region: string;
    district: string;
    gpsAddress: string;
  };
  ghanaCard: {
    idNumber: string;
    frontImage?: File;
    backImage?: File;
  };
  simInfo: {
    network: string;
    simNumber: string;
    puk: string;
    existingNumber: string;
    newNumber: string;
  };
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
  created_at: string;
}

export interface ReferralStats {
  total_invited: number;
  successful: number;
  pending: number;
  rejected: number;
  total_earned: number;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  referral_code: string;
  status: 'pending' | 'registered' | 'purchase_completed' | 'reward_granted' | 'rejected';
  order_id: string | null;
  reward_amount: number;
  fraud_check_passed: boolean | null;
  fraud_note: string | null;
  created_at: string;
  completed_at: string | null;
  referred_profile?: { full_name: string; email: string; phone: string };
}

export interface ReferralReward {
  id: string;
  referral_id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  created_at: string;
  paid_at: string | null;
}

export interface AgentApplication {
  id: string;
  user_id: string;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount_paid: number;
  payment_reference?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_id?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

/** Application row from admin_get_agent_applications — includes joined profile fields */
export interface AgentApplicationRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount_paid: number;
  payment_reference?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

/** Agent profile row from admin_get_agent_applications */
export interface AgentProfileRow {
  id: string;
  agent_id?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  agent_status?: string | null;
  agent_verified?: boolean | null;
  agent_since?: string | null;
  registrations_count: number;
  earnings: number;
}

/** Bundle returned by admin_get_agent_applications RPC */
export interface AgentApplicationsBundle {
  applications: AgentApplicationRow[];
  agents: AgentProfileRow[];
}

/** User row returned by walletApi.adminListUsers() — includes wallet fields */
export interface AdminWalletUser {
  id: string;
  full_name: string | null;
  email: string | null;
  wallet_balance: number | string | null;
  wallet_status?: string | null;
}

/** Response from agentApi.initiateApplication() — Paystack setup payload */
export interface AgentApplicationInit {
  access_code?: string;
  reference?: string;
  application_id?: string;
  amount?: number;
  authorization_url?: string;
  error?: string;
}

/** Response from agentApi.verifyApplication() */
export interface AgentApplicationVerify {
  payment_status?: string;
  status?: string;
  error?: string;
}

export interface AgentPricing {
  id: string;
  key: string;
  label: string;
  normal_price: number;
  agent_price?: number;
  savings?: number;
  type: string;
  category: string;
}

export interface AgentDashboardData {
  registrations_count: number;
  orders_count: number;
  total_earnings: number;
  recent_registrations: { id: string; full_name: string; status: string; created_at: string }[];
}

export interface RolePermission {
  id: string;
  role: UserRole;
  permission: string;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  setting_name: string;
  setting_value: string;
  updated_at: string;
}

export interface WhatsAppConfig {
  userNumber: string;
  agentNumber: string;
  userMessage: string;
  agentMessage: string;
  enabled: boolean;
}

// ============================================================
// API response shapes (derived from edge-function successResp payloads)
// ============================================================

/** Referral transactions returned by referrals edge fn
 *  (select: id, amount, description, reference, created_at, status) */
export interface ReferralTransaction {
  id: string;
  amount: number;
  description: string | null;
  reference: string | null;
  created_at: string;
  status: string;
}

/** Generic ok/err envelope returned by most action-style edge endpoints */
export interface ActionResult {
  message?: string;
  [key: string]: unknown;
}

/** Audit log row returned by admin-audit list */
export interface AuditLog {
  id: string;
  admin_id?: string | null;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

/** Result of adminCustomerApi.deleteUser — may carry auth-ban warning */
export interface DeleteUserResult extends ActionResult {
  data?: {
    auth_ban_status?: string;
    [key: string]: unknown;
  };
}

/** Result of notificationApi.sendPush — delivery counters */
export interface SendPushResult extends ActionResult {
  sent?: number;
  skipped?: number;
}

/** Result of registrationApi.adminUpdateStatus — may carry a referral warning */
export interface UpdateRegistrationStatusResult extends ActionResult {
  referral_warning?: string;
}

/** Row returned in the app_settings array of the admin-settings bundle */
export interface AppSettingRow {
  key: string;
  value: string | null;
}

/** Row returned in the system_settings array of the admin-settings bundle */
export interface SystemSettingRow {
  setting_name: string;
  setting_value: string | null;
}

/** Row returned in the pricing array of the admin-settings bundle */
export interface PricingRow {
  key: string;
  label?: string | null;
  amount?: number | string | null;
  normal_price?: number | string | null;
  agent_price?: number | string | null;
  type?: string | null;
  category?: string | null;
  active?: boolean;
  updated_at?: string;
}

/** Bundle returned by adminSettingsApi.getAll() */
export interface AdminSettingsBundle {
  app_settings?: AppSettingRow[];
  system_settings?: SystemSettingRow[];
  pricing?: PricingRow[];
}

/** Customer row returned by adminCustomerApi.list() — a User plus soft-delete flag */
export interface AdminCustomer extends User {
  deleted_at?: string | null;
}
