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
  customer_name: string;
  customer_phone: string;
  amount: number;
  description: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'completed' | 'cancelled' | 'failed';
  payment_method?: string;
  payment_status?: string;
  created_at: string;
  updated_at: string;
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
