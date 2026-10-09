import { supabase } from './supabase';
import type {
  Profile,
  User,
  Order,
  Transaction,
  Notification,
  Referral,
  ReferralReward,
  ReferralStats,
  ReferralTransaction,
  AgentApplication,
  AgentApplicationsBundle,
  AgentDashboardData,
  SystemSetting,
  AuditLog,
  ActionResult,
  DeleteUserResult,
  SendPushResult,
  UpdateRegistrationStatusResult,
  AdminSettingsBundle,
  AdminCustomer,
  AdminWalletUser,
} from '../types';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

const INVOKE_TIMEOUT_MS = 15_000;

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function invoke<T = unknown>(
  functionName: string,
  body?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const url = `${FUNCTIONS_URL}/${functionName}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

  const options: RequestInit = { method, headers, signal: controller.signal };

  if (method === 'POST' && body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const json = await res.json();

    if (!res.ok || json.success === false) {
      const error = new Error(json.error || `Request failed: ${res.status}`) as Error & {
        code?: string;
        status?: number;
        data?: unknown;
      };
      error.code = json.code;
      error.status = res.status;
      error.data = json.data;
      throw error;
    }

    return json.data !== undefined ? json.data : json;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// PROFILE
// ============================================================
export const profileApi = {
  get: (userId?: string): Promise<Profile> => {
    const qs = userId ? `?user_id=${userId}` : '';
    return invoke<Profile>(`get-profile${qs}`, undefined, 'GET');
  },

  update: (data: Record<string, unknown>): Promise<ActionResult> =>
    invoke<ActionResult>('update-profile', data),

  getUserRole: (userId?: string): Promise<string> =>
    invoke<string>('get-profile', { action: 'get_user_role', user_id: userId }),

  isAdmin: (): Promise<boolean> =>
    invoke<boolean>('get-profile', { action: 'is_admin' }),

  getWalletBalance: (userId?: string): Promise<{ wallet_balance: number }> =>
    invoke<{ wallet_balance: number }>('get-profile', { action: 'get_wallet_balance', user_id: userId }),

  uploadAvatar: (fileName: string, fileContent: string): Promise<{ avatar_url: string }> =>
    invoke<{ avatar_url: string }>('get-profile', { action: 'upload_avatar', file_name: fileName, file_content: fileContent }),

  getRegistration: (id: string): Promise<unknown> =>
    invoke<unknown>('get-profile', { action: 'get_registration', id }),
};

// ============================================================
// REGISTRATIONS
// ============================================================
export const registrationApi = {
  create: (data: Record<string, unknown>): Promise<{ id: string; [k: string]: unknown }> =>
    invoke<{ id: string }>('create-registration', data),

  adminList: (status?: string, userId?: string): Promise<unknown[]> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (userId) params.set('user_id', userId);
    const qs = params.toString();
    return invoke<unknown[]>(`admin-registrations${qs ? '?' + qs : ''}`, undefined, 'GET');
  },

  adminUpdateStatus: (id: string, status: string, adminNotes?: string, userMessage?: string): Promise<UpdateRegistrationStatusResult> =>
    invoke<UpdateRegistrationStatusResult>('admin-registrations', { action: 'update_status', id, status, admin_notes: adminNotes, user_message: userMessage }),

  adminBulkUpdate: (ids: string[], status: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'bulk_update', ids, status }),

  adminAddTimeline: (registrationId: string, status: string, note?: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'add_timeline', registration_id: registrationId, status, note }),

  adminAssignAdmin: (id: string, adminId: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'assign_admin', id, admin_id: adminId }),

  adminAddDocument: (registrationId: string, documentType: string, documentUrl: string, fileName?: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'add_document', registration_id: registrationId, document_type: documentType, document_url: documentUrl, file_name: fileName }),

  adminUpdateDocumentStatus: (id: string, status: string, adminNotes?: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'update_document_status', id, status, admin_notes: adminNotes }),

  adminProcessReferralReward: (registrationId: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-registrations', { action: 'process_referral_reward', registration_id: registrationId }),
};

// ============================================================
// WALLET
// ============================================================
export const walletApi = {
  getTransactions: (): Promise<Transaction[]> =>
    invoke<Transaction[]>('wallet-topup', { action: 'get_transactions' }),

  initiateTopUp: (amount: number): Promise<{ authorization_url?: string; reference?: string; [k: string]: unknown }> =>
    invoke('initiate-wallet-topup', { amount }),

  verifyTopUp: (reference: string): Promise<ActionResult> =>
    invoke<ActionResult>('verify-wallet-topup', { reference }),

  adminListUsers: (): Promise<AdminWalletUser[]> =>
    invoke<AdminWalletUser[]>('admin-wallet', { action: 'list_users' }),

  adminListTransactions: (userId: string): Promise<Transaction[]> =>
    invoke<Transaction[]>('admin-wallet', { action: 'list_transactions', user_id: userId }),

  adminCredit: (userId: string, amount: number, description: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-wallet', { action: 'credit', user_id: userId, amount, description }),

  adminDebit: (userId: string, amount: number, description: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-wallet', { action: 'debit', user_id: userId, amount, description }),

  adminUpdateStatus: (id: string, status: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-wallet', { action: 'update_status', id, status }),
};

// ============================================================
// ORDERS
// ============================================================
export const orderApi = {
  list: (userId?: string): Promise<Order[]> =>
    invoke<Order[]>(`orders${userId ? '?user_id=' + userId : ''}`, undefined, 'GET'),

  updateStatus: (id: string, status: string): Promise<ActionResult> =>
    invoke<ActionResult>('orders', { action: 'update_status', id, status }),
};

// ============================================================
// REFERRALS
// ============================================================
export const referralApi = {
  getProfile: (): Promise<Profile> =>
    invoke<Profile>('referrals', undefined, 'GET'),

  getStats: (): Promise<ReferralStats> =>
    invoke<ReferralStats>('referrals', { action: 'get_stats' }),

  getMyReferrals: (): Promise<Referral[]> =>
    invoke<Referral[]>('referrals', { action: 'get_my_referrals' }),

  getMyRewards: (): Promise<ReferralReward[]> =>
    invoke<ReferralReward[]>('referrals', { action: 'get_my_rewards' }),

  generateCode: (): Promise<{ referral_code: string }> =>
    invoke<{ referral_code: string }>('referrals', { action: 'generate_code' }),

  validateCode: (code: string): Promise<ActionResult> =>
    invoke<ActionResult>('referrals', { action: 'validate_code', code }),

  createReferral: (referralCode: string, deviceFingerprint?: string): Promise<ActionResult> =>
    invoke<ActionResult>('referrals', { action: 'create_referral', referral_code: referralCode, device_fingerprint: deviceFingerprint }),

  getMyReferralTransactions: (): Promise<ReferralTransaction[]> =>
    invoke<ReferralTransaction[]>('referrals', { action: 'get_my_referral_transactions' }),

  adminAnalytics: (): Promise<unknown> =>
    invoke<unknown>('admin-referrals', { action: 'analytics' }),

  adminList: (): Promise<Referral[]> =>
    invoke<Referral[]>('admin-referrals', { action: 'list' }),

  adminUpdateStatus: (id: string, status: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-referrals', { action: 'update_status', id, status }),

  adminRetryReward: (referralId: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-referrals', { action: 'retry_reward', referral_id: referralId }),
};

// ============================================================
// AGENTS
// ============================================================
export const agentApi = {
  initiateApplication: (): Promise<{ authorization_url?: string; reference?: string; [k: string]: unknown }> =>
    invoke('initiate-agent-application'),

  verifyApplication: (reference: string): Promise<ActionResult> =>
    invoke<ActionResult>('verify-agent-application', { reference }),

  getDashboard: (): Promise<AgentDashboardData> =>
    invoke<AgentDashboardData>('admin-agents', undefined, 'GET'),

  getApplications: (): Promise<AgentApplication[]> =>
    invoke<AgentApplication[]>('agent-apply', { action: 'get_applications' }),

  getApplication: (userId?: string): Promise<AgentApplication | null> =>
    invoke<AgentApplication | null>('agent-apply', { action: 'get_application', user_id: userId }),

  getTransactions: (userId?: string): Promise<Transaction[]> =>
    invoke<Transaction[]>('agent-apply', { action: 'get_transactions', user_id: userId }),

  getPricing: (): Promise<unknown> =>
    invoke<unknown>('agent-apply', { action: 'get_pricing' }),

  checkPermission: (permission: string): Promise<boolean> =>
    invoke<boolean>('agent-apply', { action: 'check_permission', permission }),

  adminGetApplications: (): Promise<AgentApplicationsBundle> =>
    invoke<AgentApplicationsBundle>('admin-agents', { action: 'get_applications' }),

  adminApprove: (applicationId: string, status: string, adminNotes?: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-agents', { action: 'approve', application_id: applicationId, status, admin_notes: adminNotes }),

  adminToggleStatus: (userId: string, status: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-agents', { action: 'toggle_status', user_id: userId, status }),
};

// ============================================================
// ADMIN SETTINGS
// ============================================================
export const adminSettingsApi = {
  getAll: (): Promise<AdminSettingsBundle> =>
    invoke<AdminSettingsBundle>('admin-settings', undefined, 'GET'),

  saveAppSettings: (settings: Record<string, string>): Promise<ActionResult> =>
    invoke<ActionResult>('admin-settings', { action: 'save_app_settings', settings }),

  saveSystemSettings: (settings: Record<string, string>): Promise<ActionResult> =>
    invoke<ActionResult>('admin-settings', { action: 'save_system_settings', settings }),

  saveFees: (fees: {
    agent_fee: number;
    wallet_max_topup: number;
    wallet_min_topup: number;
  }): Promise<ActionResult> =>
    invoke<ActionResult>('admin-settings', { action: 'save_fees', ...fees }),

  // AFA prices have their own action so there is exactly one write path per price.
  saveAfaPrices: (prices: { normal_price: number; agent_price: number }): Promise<ActionResult> =>
    invoke<ActionResult>('admin-settings', { action: 'save_afa_prices', ...prices }),
};

// ============================================================
// ADMIN CUSTOMERS
// ============================================================
export const adminCustomerApi = {
  list: (): Promise<AdminCustomer[]> =>
    invoke<AdminCustomer[]>('admin-customers', { action: 'list' }),

  getUser: (userId: string): Promise<User> =>
    invoke<User>('admin-customers', { action: 'get_user', user_id: userId }),

  updateProfile: (userId: string, data: Record<string, unknown>): Promise<ActionResult> =>
    invoke<ActionResult>('admin-customers', { action: 'update_profile', user_id: userId, ...data }),

  setRole: (userId: string, role: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-set-user-role', { target_user_id: userId, new_role: role }),

  deleteUser: (userId: string, reason?: string): Promise<DeleteUserResult> =>
    invoke<DeleteUserResult>('admin-delete-user', { target_user_id: userId, reason }),
};

// ============================================================
// ADMIN DASHBOARD
// ============================================================
export interface AdminDashboardStats {
  total_users: number;
  total_registrations: number;
  today_registrations: number;
  pending_registrations: number;
  revenue: number;
  total_wallet_balance: number;
  recent_registrations: unknown[];
  approved_registrations: number;
  rejected_registrations: number;
  completed_registrations: number;
  processing_registrations: number;
}

export const adminDashboardApi = {
  getStats: (): Promise<AdminDashboardStats> =>
    invoke<AdminDashboardStats>('admin-dashboard', undefined, 'GET'),

  getDailyChart: (): Promise<unknown[]> =>
    invoke<unknown[]>('admin-dashboard', { action: 'get_daily_chart' }),
};

// ============================================================
// ADMIN REPORTS
// ============================================================
export const adminReportsApi = {
  get: (startDate?: string, endDate?: string): Promise<unknown> => {
    if (startDate || endDate) {
      return invoke<unknown>('admin-reports', { start_date: startDate, end_date: endDate });
    }
    return invoke<unknown>('admin-reports', undefined, 'GET');
  },
};

// ============================================================
// NOTIFICATIONS
// ============================================================
export const notificationApi = {
  list: (): Promise<Notification[]> =>
    invoke<Notification[]>('user-notifications', undefined, 'GET'),

  unreadCount: (): Promise<{ count: number }> =>
    invoke<{ count: number }>('user-notifications', { action: 'unread_count' }),

  markRead: (id: string): Promise<ActionResult> =>
    invoke<ActionResult>('user-notifications', { action: 'mark_read', id }),

  markAllRead: (): Promise<ActionResult> =>
    invoke<ActionResult>('user-notifications', { action: 'mark_all_read' }),

  delete: (id: string): Promise<ActionResult> =>
    invoke<ActionResult>('user-notifications', { action: 'delete', id }),

  adminList: (): Promise<Notification[]> =>
    invoke<Notification[]>('admin-notifications', { action: 'list' }),

  adminSend: (title: string, message: string, type: string, userIds?: string[], sendToAll?: boolean): Promise<ActionResult> =>
    invoke<ActionResult>('admin-notifications', { action: 'send', title, message, type, user_ids: userIds, send_to_all: sendToAll }),

  adminUploadImage: (fileName: string, fileContent: string): Promise<{ url?: string; [k: string]: unknown }> =>
    invoke('admin-notifications', { action: 'upload_image', file_name: fileName, file_content: fileContent }),

  adminGetAllUserIds: (): Promise<string[]> =>
    invoke<string[]>('admin-notifications', { action: 'get_all_user_ids' }),

  adminResolveEmail: (email: string): Promise<string> =>
    invoke<string>('admin-notifications', { action: 'resolve_email', email }),

  adminInsertNotification: (userId: string, title: string, message: string, type?: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-notifications', { action: 'insert_notification', user_id: userId, title, message, type }),

  // Real channel sends via Edge Functions
  sendEmail: (to: string, subject: string, html: string, type: string, userId?: string): Promise<ActionResult> =>
    invoke<ActionResult>('send-email', { to, subject, html, type, user_id: userId }),

  sendSms: (userId: string, phone: string, message: string, type: string): Promise<ActionResult> =>
    invoke<ActionResult>('send-sms', { user_id: userId, phone, message, type }),

  sendPush: (userId: string | null, title: string, body: string, url?: string, type?: string): Promise<SendPushResult> =>
    invoke<SendPushResult>('send-push', { user_id: userId, title, body, url, type }),

  // Delivery log
  getDeliveryLog: (channel?: string): Promise<unknown[]> => {
    const params = channel ? `?channel=${channel}` : '';
    return invoke<unknown[]>(`send-email${params}`, undefined, 'GET');
  },
};

// ============================================================
// ADMIN PAYMENTS
// ============================================================
export const adminPaymentApi = {
  list: (): Promise<unknown[]> =>
    invoke<unknown[]>('admin-payments', { action: 'list' }),

  refund: (id: string, amount: number, description: string, userId: string): Promise<ActionResult> =>
    invoke<ActionResult>('admin-payments', { action: 'refund', id, amount, description, user_id: userId }),
};

// ============================================================
// SUPPORT TICKETS
// ============================================================
export const ticketApi = {
  list: (): Promise<unknown[]> =>
    invoke<unknown[]>('support-tickets', undefined, 'GET'),

  create: (subject: string, message: string, priority?: string): Promise<ActionResult> =>
    invoke<ActionResult>('support-tickets', { action: 'create', subject, message, priority }),

  updateStatus: (id: string, status: string): Promise<ActionResult> =>
    invoke<ActionResult>('support-tickets', { action: 'update_status', id, status }),
};

// ============================================================
// ADMIN CONFIG
// ============================================================
export const adminConfigApi = {
  getWhatsApp: (): Promise<unknown> =>
    invoke<unknown>('admin-config', undefined, 'GET'),

  updateWhatsApp: (settings: Record<string, string>): Promise<ActionResult> =>
    invoke<ActionResult>('admin-config', { action: 'update_whatsapp', settings }),

  getPayment: (): Promise<unknown> =>
    invoke<unknown>('admin-config', { action: 'get_payment' }),

  updatePayment: (settings: Record<string, string>): Promise<ActionResult> =>
    invoke<ActionResult>('admin-config', { action: 'update_payment', settings }),

  getAnnouncements: (activeOnly?: boolean): Promise<unknown[]> =>
    invoke<unknown[]>('admin-config', { action: 'get_announcements', active_only: activeOnly }),

  createAnnouncement: (title: string, message: string, active?: boolean): Promise<ActionResult> =>
    invoke<ActionResult>('admin-config', { action: 'create_announcement', title, message, active }),

  getSystemSettings: (): Promise<SystemSetting[]> =>
    invoke<SystemSetting[]>('admin-config?action=system_settings', undefined, 'GET'),
};

// ============================================================
// ADMIN AUDIT
// ============================================================
export const adminAuditApi = {
  list: (filters?: { start_date?: string; end_date?: string; action?: string; entity?: string }): Promise<AuditLog[]> => {
    if (filters && Object.values(filters).some(Boolean)) {
      return invoke<AuditLog[]>('admin-audit', filters);
    }
    return invoke<AuditLog[]>('admin-audit', undefined, 'GET');
  },
};

// ============================================================
// PUSH SUBSCRIPTIONS
// ============================================================
export const pushApi = {
  getVapidKey: async (): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/push-subscriptions?action=vapid_key`, {
        signal: controller.signal,
      });
      const json = await res.json();
      return json.data?.key;
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  },

  checkSubscription: (endpoint: string): Promise<{ subscribed?: boolean; [k: string]: unknown }> =>
    invoke('push-subscriptions', { action: 'check_subscription', endpoint }),

  subscribe: (endpoint: string, p256dhKey: string, authKey: string): Promise<ActionResult> =>
    invoke<ActionResult>('push-subscriptions', { action: 'subscribe', endpoint, p256dh_key: p256dhKey, auth_key: authKey }),

  unsubscribe: (): Promise<ActionResult> =>
    invoke<ActionResult>('push-subscriptions', { action: 'unsubscribe' }),
};

// ============================================================
// PRICING (public read)
// ============================================================
export const pricingApi = {
  get: async () => {
    // Public read via RLS. Columns are listed explicitly: migration 029 takes
    // SELECT on the whole table away from anon/authenticated and grants only
    // these, so `select('*')` would start failing.
    // normal_price / agent_price are deliberately absent - the tier prices are
    // only reachable through getAfa() (own tier) or admin-settings (admin).
    const { data, error } = await supabase
      .from('pricing')
      .select('key, label, amount, type, category, active, updated_at')
      .eq('active', true);
    if (error) throw new Error(error.message || 'Failed to load pricing');
    return data || [];
  },

  // The caller's OWN AFA price, resolved from their real role in the database.
  // For a normal user this returns `price` + `profit_margin` but never the raw
  // agent price; for an admin it also returns both tier prices.
  getAfa: (): Promise<{
    tier: 'normal' | 'agent';
    price: string | number;
    max_topup: string | number | null;
    profit_margin?: number;
    normal_price?: string | number | null;
    agent_price?: string | number | null;
  }> => invoke('get-profile', { action: 'get_afa_pricing' }),
};

// ============================================================
// APP SETTINGS (public read)
// ============================================================
export const settingsApi = {
  get: async () => {
    const { data } = await supabase.from('app_settings').select('*');
    return data || [];
  },

  getSetting: async (key: string) => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
    return data?.value;
  },
};

// ============================================================
// AUDIT LOGS (write via Edge Function)
// ============================================================
export const auditApi = {
  create: async (data: { entity: string; entity_id?: string; details?: Record<string, unknown> }): Promise<ActionResult> => {
    return invoke<ActionResult>('admin-audit', { action: 'create', ...data });
  },
};

// ============================================================
// WHATSAPP CONFIG (public read)
// ============================================================
export const whatsappConfigApi = {
  get: async () => {
    const { data } = await supabase.from('whatsapp_config').select('*');
    return data || [];
  },
};

// ============================================================
// ANNOUNCEMENTS (public read for active)
// ============================================================
export const announcementsApi = {
  getActive: async () => {
    const { data } = await supabase.from('announcements').select('*').eq('active', true);
    return data || [];
  },
};
