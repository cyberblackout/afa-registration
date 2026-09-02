import { supabase } from './supabase';

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
      throw new Error(json.error || `Request failed: ${res.status}`);
    }

    return json.data !== undefined ? json.data : json;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
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
  get: (userId?: string): Promise<any> => {
    const qs = userId ? `?user_id=${userId}` : '';
    return invoke<any>(`get-profile${qs}`, undefined, 'GET');
  },

  update: (data: Record<string, unknown>): Promise<any> =>
    invoke<any>('update-profile', data),

  getUserRole: (userId?: string): Promise<string> =>
    invoke<string>('get-profile', { action: 'get_user_role', user_id: userId }),

  isAdmin: (): Promise<boolean> =>
    invoke<boolean>('get-profile', { action: 'is_admin' }),

  getWalletBalance: (userId?: string): Promise<any> =>
    invoke<any>('get-profile', { action: 'get_wallet_balance', user_id: userId }),

  uploadAvatar: (fileName: string, fileContent: string): Promise<any> =>
    invoke<any>('get-profile', { action: 'upload_avatar', file_name: fileName, file_content: fileContent }),

  getRegistration: (id: string): Promise<any> =>
    invoke<any>('get-profile', { action: 'get_registration', id }),
};

// ============================================================
// REGISTRATIONS
// ============================================================
export const registrationApi = {
  create: (data: Record<string, unknown>): Promise<any> =>
    invoke<any>('create-registration', data),

  adminList: (status?: string, userId?: string): Promise<any[]> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (userId) params.set('user_id', userId);
    const qs = params.toString();
    return invoke<any[]>(`admin-registrations${qs ? '?' + qs : ''}`, undefined, 'GET');
  },

  adminUpdateStatus: (id: string, status: string, adminNotes?: string, userMessage?: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'update_status', id, status, admin_notes: adminNotes, user_message: userMessage }),

  adminBulkUpdate: (ids: string[], status: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'bulk_update', ids, status }),

  adminAddTimeline: (registrationId: string, status: string, note?: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'add_timeline', registration_id: registrationId, status, note }),

  adminAssignAdmin: (id: string, adminId: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'assign_admin', id, admin_id: adminId }),

  adminAddDocument: (registrationId: string, documentType: string, documentUrl: string, fileName?: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'add_document', registration_id: registrationId, document_type: documentType, document_url: documentUrl, file_name: fileName }),

  adminUpdateDocumentStatus: (id: string, status: string, adminNotes?: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'update_document_status', id, status, admin_notes: adminNotes }),

  adminProcessReferralReward: (registrationId: string): Promise<any> =>
    invoke<any>('admin-registrations', { action: 'process_referral_reward', registration_id: registrationId }),
};

// ============================================================
// WALLET
// ============================================================
export const walletApi = {
  getTransactions: (): Promise<any[]> =>
    invoke<any[]>('wallet-topup', { action: 'get_transactions' }),

  initiateTopUp: (amount: number): Promise<any> =>
    invoke<any>('initiate-wallet-topup', { amount }),

  verifyTopUp: (reference: string): Promise<any> =>
    invoke<any>('verify-wallet-topup', { reference }),

  adminListUsers: (): Promise<any[]> =>
    invoke<any[]>('admin-wallet', { action: 'list_users' }),

  adminListTransactions: (userId: string): Promise<any[]> =>
    invoke<any[]>('admin-wallet', { action: 'list_transactions', user_id: userId }),

  adminCredit: (userId: string, amount: number, description: string): Promise<any> =>
    invoke<any>('admin-wallet', { action: 'credit', user_id: userId, amount, description }),

  adminDebit: (userId: string, amount: number, description: string): Promise<any> =>
    invoke<any>('admin-wallet', { action: 'debit', user_id: userId, amount, description }),

  adminUpdateStatus: (id: string, status: string): Promise<any> =>
    invoke<any>('admin-wallet', { action: 'update_status', id, status }),
};

// ============================================================
// ORDERS
// ============================================================
export const orderApi = {
  list: (userId?: string): Promise<any[]> =>
    invoke<any[]>(`orders${userId ? '?user_id=' + userId : ''}`, undefined, 'GET'),

  updateStatus: (id: string, status: string): Promise<any> =>
    invoke<any>('orders', { action: 'update_status', id, status }),
};

// ============================================================
// REFERRALS
// ============================================================
export const referralApi = {
  getProfile: (): Promise<any> =>
    invoke<any>('referrals', undefined, 'GET'),

  getStats: (): Promise<any> =>
    invoke<any>('referrals', { action: 'get_stats' }),

  getMyReferrals: (): Promise<any[]> =>
    invoke<any[]>('referrals', { action: 'get_my_referrals' }),

  getMyRewards: (): Promise<any[]> =>
    invoke<any[]>('referrals', { action: 'get_my_rewards' }),

  generateCode: (): Promise<any> =>
    invoke<any>('referrals', { action: 'generate_code' }),

  validateCode: (code: string): Promise<any> =>
    invoke<any>('referrals', { action: 'validate_code', code }),

  createReferral: (referralCode: string, deviceFingerprint?: string): Promise<any> =>
    invoke<any>('referrals', { action: 'create_referral', referral_code: referralCode, device_fingerprint: deviceFingerprint }),

  getMyReferralTransactions: (): Promise<any[]> =>
    invoke<any[]>('referrals', { action: 'get_my_referral_transactions' }),

  adminAnalytics: (): Promise<any> =>
    invoke<any>('admin-referrals', { action: 'analytics' }),

  adminList: (): Promise<any[]> =>
    invoke<any[]>('admin-referrals', { action: 'list' }),

  adminUpdateStatus: (id: string, status: string): Promise<any> =>
    invoke<any>('admin-referrals', { action: 'update_status', id, status }),

  adminRetryReward: (referralId: string): Promise<any> =>
    invoke<any>('admin-referrals', { action: 'retry_reward', referral_id: referralId }),
};

// ============================================================
// AGENTS
// ============================================================
export const agentApi = {
  initiateApplication: (): Promise<any> =>
    invoke<any>('initiate-agent-application'),

  verifyApplication: (reference: string): Promise<any> =>
    invoke<any>('verify-agent-application', { reference }),

  getDashboard: (): Promise<any> =>
    invoke<any>('admin-agents', undefined, 'GET'),

  getApplications: (): Promise<any[]> =>
    invoke<any[]>('agent-apply', { action: 'get_applications' }),

  getApplication: (userId?: string): Promise<any> =>
    invoke<any>('agent-apply', { action: 'get_application', user_id: userId }),

  getTransactions: (userId?: string): Promise<any[]> =>
    invoke<any[]>('agent-apply', { action: 'get_transactions', user_id: userId }),

  getPricing: (): Promise<any> =>
    invoke<any>('agent-apply', { action: 'get_pricing' }),

  checkPermission: (permission: string): Promise<boolean> =>
    invoke<boolean>('agent-apply', { action: 'check_permission', permission }),

  adminGetApplications: (): Promise<any[]> =>
    invoke<any[]>('admin-agents', { action: 'get_applications' }),

  adminApprove: (applicationId: string, status: string, adminNotes?: string): Promise<any> =>
    invoke<any>('admin-agents', { action: 'approve', application_id: applicationId, status, admin_notes: adminNotes }),

  adminToggleStatus: (userId: string, status: string): Promise<any> =>
    invoke<any>('admin-agents', { action: 'toggle_status', user_id: userId, status }),
};

// ============================================================
// ADMIN SETTINGS
// ============================================================
export const adminSettingsApi = {
  getAll: (): Promise<any> =>
    invoke<any>('admin-settings', undefined, 'GET'),

  saveAppSettings: (settings: Record<string, string>): Promise<any> =>
    invoke<any>('admin-settings', { action: 'save_app_settings', settings }),

  saveSystemSettings: (settings: Record<string, string>): Promise<any> =>
    invoke<any>('admin-settings', { action: 'save_system_settings', settings }),

  saveFees: (fees: {
    agent_fee: number;
    afa_registration: number;
    wallet_max_topup: number;
    wallet_min_topup: number;
    referral_bonus: number;
  }): Promise<any> =>
    invoke<any>('admin-settings', { action: 'save_fees', ...fees }),
};

// ============================================================
// ADMIN CUSTOMERS
// ============================================================
export const adminCustomerApi = {
  list: (): Promise<any[]> =>
    invoke<any[]>('admin-customers', { action: 'list' }),

  getUser: (userId: string): Promise<any> =>
    invoke<any>('admin-customers', { action: 'get_user', user_id: userId }),

  updateProfile: (userId: string, data: Record<string, unknown>): Promise<any> =>
    invoke<any>('admin-customers', { action: 'update_profile', user_id: userId, ...data }),

  updateRole: (userId: string, role: string): Promise<any> =>
    invoke<any>('admin-customers', { action: 'update_role', user_id: userId, role }),
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
  recent_registrations: any[];
  approved_registrations: number;
  rejected_registrations: number;
  completed_registrations: number;
  processing_registrations: number;
}

export const adminDashboardApi = {
  getStats: (): Promise<AdminDashboardStats> =>
    invoke<AdminDashboardStats>('admin-dashboard', undefined, 'GET'),

  getDailyChart: (): Promise<any[]> =>
    invoke<any[]>('admin-dashboard', { action: 'get_daily_chart' }),
};

// ============================================================
// ADMIN REPORTS
// ============================================================
export const adminReportsApi = {
  get: (startDate?: string, endDate?: string): Promise<any> => {
    if (startDate || endDate) {
      return invoke<any>('admin-reports', { start_date: startDate, end_date: endDate });
    }
    return invoke<any>('admin-reports', undefined, 'GET');
  },
};

// ============================================================
// NOTIFICATIONS
// ============================================================
export const notificationApi = {
  list: (): Promise<any[]> =>
    invoke<any[]>('user-notifications', undefined, 'GET'),

  unreadCount: (): Promise<any> =>
    invoke<any>('user-notifications', { action: 'unread_count' }),

  markRead: (id: string): Promise<any> =>
    invoke<any>('user-notifications', { action: 'mark_read', id }),

  markAllRead: (): Promise<any> =>
    invoke<any>('user-notifications', { action: 'mark_all_read' }),

  delete: (id: string): Promise<any> =>
    invoke<any>('user-notifications', { action: 'delete', id }),

  adminList: (): Promise<any[]> =>
    invoke<any[]>('admin-notifications', { action: 'list' }),

  adminSend: (title: string, message: string, type: string, userIds?: string[], sendToAll?: boolean): Promise<any> =>
    invoke<any>('admin-notifications', { action: 'send', title, message, type, user_ids: userIds, send_to_all: sendToAll }),

  adminUploadImage: (fileName: string, fileContent: string): Promise<any> =>
    invoke<any>('admin-notifications', { action: 'upload_image', file_name: fileName, file_content: fileContent }),

  adminGetAllUserIds: (): Promise<string[]> =>
    invoke<string[]>('admin-notifications', { action: 'get_all_user_ids' }),

  adminResolveEmail: (email: string): Promise<string> =>
    invoke<string>('admin-notifications', { action: 'resolve_email', email }),

  adminInsertNotification: (userId: string, title: string, message: string, type?: string): Promise<any> =>
    invoke<any>('admin-notifications', { action: 'insert_notification', user_id: userId, title, message, type }),

  // Real channel sends via Edge Functions
  sendEmail: (to: string, subject: string, html: string, type: string, userId?: string): Promise<any> =>
    invoke<any>('send-email', { to, subject, html, type, user_id: userId }),

  sendSms: (userId: string, phone: string, message: string, type: string): Promise<any> =>
    invoke<any>('send-sms', { user_id: userId, phone, message, type }),

  sendPush: (userId: string | null, title: string, body: string, url?: string, type?: string): Promise<any> =>
    invoke<any>('send-push', { user_id: userId, title, body, url, type }),

  // Delivery log
  getDeliveryLog: (channel?: string): Promise<any[]> => {
    const params = channel ? `?channel=${channel}` : '';
    return invoke<any[]>(`send-email${params}`, undefined, 'GET');
  },
};

// ============================================================
// ADMIN PAYMENTS
// ============================================================
export const adminPaymentApi = {
  list: (): Promise<any[]> =>
    invoke<any[]>('admin-payments', { action: 'list' }),

  refund: (id: string, amount: number, description: string, userId: string): Promise<any> =>
    invoke<any>('admin-payments', { action: 'refund', id, amount, description, user_id: userId }),

  updateStatus: (id: string, status: string): Promise<any> =>
    invoke<any>('admin-payments', { action: 'update_status', id, status }),
};

// ============================================================
// SUPPORT TICKETS
// ============================================================
export const ticketApi = {
  list: (): Promise<any[]> =>
    invoke<any[]>('support-tickets', undefined, 'GET'),

  create: (subject: string, message: string, priority?: string): Promise<any> =>
    invoke<any>('support-tickets', { action: 'create', subject, message, priority }),

  updateStatus: (id: string, status: string): Promise<any> =>
    invoke<any>('support-tickets', { action: 'update_status', id, status }),
};

// ============================================================
// ADMIN CONFIG
// ============================================================
export const adminConfigApi = {
  getWhatsApp: (): Promise<any> =>
    invoke<any>('admin-config', undefined, 'GET')
      .then((d: any) => d),

  updateWhatsApp: (settings: Record<string, string>): Promise<any> =>
    invoke<any>('admin-config', { action: 'update_whatsapp', settings }),

  getPayment: (): Promise<any> =>
    invoke<any>('admin-config', { action: 'get_payment' }),

  updatePayment: (settings: Record<string, string>): Promise<any> =>
    invoke<any>('admin-config', { action: 'update_payment', settings }),

  getAnnouncements: (activeOnly?: boolean): Promise<any[]> =>
    invoke<any[]>('admin-config', { action: 'get_announcements', active_only: activeOnly }),

  createAnnouncement: (title: string, message: string, active?: boolean): Promise<any> =>
    invoke<any>('admin-config', { action: 'create_announcement', title, message, active }),

  getSystemSettings: (): Promise<any[]> =>
    invoke<any[]>('admin-config?action=system_settings', undefined, 'GET'),
};

// ============================================================
// ADMIN AUDIT
// ============================================================
export const adminAuditApi = {
  list: (filters?: { start_date?: string; end_date?: string; action?: string; entity?: string }): Promise<any[]> => {
    if (filters && Object.values(filters).some(Boolean)) {
      return invoke<any[]>('admin-audit', filters);
    }
    return invoke<any[]>('admin-audit', undefined, 'GET');
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

  checkSubscription: (endpoint: string): Promise<any> =>
    invoke<any>('push-subscriptions', { action: 'check_subscription', endpoint }),

  subscribe: (endpoint: string, p256dhKey: string, authKey: string): Promise<any> =>
    invoke<any>('push-subscriptions', { action: 'subscribe', endpoint, p256dh_key: p256dhKey, auth_key: authKey }),

  unsubscribe: (): Promise<any> =>
    invoke<any>('push-subscriptions', { action: 'unsubscribe' }),
};

// ============================================================
// PRICING (public read)
// ============================================================
export const pricingApi = {
  get: async () => {
    // Pricing is public read via RLS - use direct Supabase for this
    const { data } = await supabase.from('pricing').select('*').eq('active', true);
    return data || [];
  },
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
  create: async (data: { entity: string; entity_id?: string; details?: Record<string, unknown> }): Promise<any> => {
    return invoke<any>('admin-audit', { action: 'create', ...data });
  },
};

// ============================================================
// ROLE PERMISSIONS
// ============================================================
export const rolePermissionsApi = {
  get: async () => {
    const { data } = await supabase.from('role_permissions').select('*');
    return data || [];
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
