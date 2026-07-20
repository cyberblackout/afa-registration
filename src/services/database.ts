import { supabase } from './supabase';
import { Profile } from '../types';

export const db = {
  // PROFILES
  getProfile: (userId: string) =>
    supabase.from('profiles').select('*').eq('id', userId).single(),

  updateProfile: (userId: string, data: Partial<Profile>) =>
    supabase.from('profiles').update(data).eq('id', userId),

  uploadAvatar: async (userId: string, file: File) => {
    const ext = file.name.split('.').pop();
    const filePath = `avatars/${userId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);
    return supabase
      .from('profiles')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', userId);
  },

  // AUTH / ROLES
  getUserRole: (userId: string) =>
    supabase.rpc('get_user_role', { user_id: userId }),

  isAdmin: () => supabase.rpc('is_admin'),

  getAllUsers: () =>
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false }),

  updateUserRole: (userId: string, role: string) =>
    supabase.from('profiles').update({ role: role as any }).eq('id', userId),

  // REGISTRATIONS
  getRegistrations: (userId?: string) => {
    let query = supabase
      .from('registrations')
      .select('*, registration_documents(*), registration_timeline(*)')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    return query;
  },

  getRegistration: (id: string) =>
    supabase
      .from('registrations')
      .select('*, registration_documents(*), registration_timeline(*)')
      .eq('id', id)
      .single(),

  createRegistration: (data: any) =>
    supabase.from('registrations').insert(data).select().single(),

  updateRegistrationStatus: (id: string, status: string, adminNotes?: string) =>
    supabase.from('registrations').update({ status, admin_notes: adminNotes }).eq('id', id),

  addRegistrationTimeline: (data: any) =>
    supabase.from('registration_timeline').insert(data),

  addRegistrationDocument: (data: any) =>
    supabase.from('registration_documents').insert(data),

  updateDocumentStatus: (id: string, status: string, adminNotes?: string) =>
    supabase.from('registration_documents').update({ status, admin_notes: adminNotes }).eq('id', id),

  assignRegistrationAdmin: (id: string, adminId: string) =>
    supabase.from('registrations').update({ assigned_admin_id: adminId }).eq('id', id),

  // WALLET
  getWalletBalance: (userId: string) =>
    supabase.from('profiles').select('wallet_balance').eq('id', userId).single(),

  getTransactions: (userId: string) =>
    supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

  getAllTransactions: () =>
    supabase
      .from('wallet_transactions')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false }),

  creditWallet: (userId: string, amount: number, description: string, reference?: string) =>
    supabase.rpc('credit_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
      p_reference: reference,
    }),

  debitWallet: (userId: string, amount: number, description: string) =>
    supabase.rpc('debit_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    }),

  // ORDERS
  getOrders: (userId?: string) => {
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    return query;
  },

  createOrder: (data: any) =>
    supabase.from('orders').insert(data).select().single(),

  updateOrderStatus: (id: string, status: string) =>
    supabase.from('orders').update({ status }).eq('id', id),

  // NOTIFICATIONS
  getNotifications: (userId: string) =>
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

  getUnreadCount: (userId: string) =>
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false),

  markNotificationRead: (id: string) =>
    supabase.from('notifications').update({ read: true }).eq('id', id),

  markAllNotificationsRead: (userId: string) =>
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false),

  deleteNotification: (id: string) =>
    supabase.from('notifications').delete().eq('id', id),

  createNotification: (data: any) =>
    supabase.from('notifications').insert(data),

  // PRICING
  getPricing: () =>
    supabase.from('pricing').select('*').eq('active', true),

  updatePricing: (id: string, amount: number) =>
    supabase.from('pricing').update({ amount }).eq('id', id),

  // SETTINGS
  getSettings: () => supabase.from('app_settings').select('*'),

  getSetting: (key: string) =>
    supabase.from('app_settings').select('value').eq('key', key).single(),

  updateSetting: (key: string, value: any) =>
    supabase.from('app_settings').update({ value }).eq('key', key),

  // AUDIT LOGS
  getAuditLogs: () =>
    supabase
      .from('audit_logs')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false }),

  createAuditLog: (data: any) => supabase.from('audit_logs').insert(data),

  // ANNOUNCEMENTS
  getActiveAnnouncements: () =>
    supabase.from('announcements').select('*').eq('active', true),

  getAnnouncements: () =>
    supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false }),

  createAnnouncement: (data: any) =>
    supabase.from('announcements').insert(data),

  // WHATSAPP CONFIG
  getWhatsAppConfig: () => supabase.from('whatsapp_config').select('*'),

  updateWhatsAppConfig: (key: string, value: string) =>
    supabase.from('whatsapp_config').upsert({ key, value }),

  // PAYMENT CONFIG
  getPaymentConfig: () => supabase.from('payment_config').select('*'),

  updatePaymentConfig: (key: string, value: string) =>
    supabase.from('payment_config').upsert({ key, value }),

  // SUPPORT TICKETS
  getTickets: (userId?: string) => {
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    return query;
  },

  createTicket: (data: any) =>
    supabase.from('support_tickets').insert(data),

  updateTicketStatus: (id: string, status: string) =>
    supabase.from('support_tickets').update({ status }).eq('id', id),

  // REFERRALS
  generateReferralCode: () => supabase.rpc('generate_referral_code'),

  getReferralStats: () => supabase.rpc('get_referral_stats'),

  validateReferralCode: (code: string) =>
    supabase.rpc('validate_referral_code', { code }),

  getMyReferrals: (userId: string) =>
    supabase
      .from('referrals')
      .select('*, referred_profile:profiles!referred_id(full_name, email, phone)')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false }),

  getMyReferralRewards: (userId: string) =>
    supabase
      .from('referral_rewards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

  getMyReferralCode: (userId: string) =>
    supabase.from('profiles').select('referral_code').eq('id', userId).single(),

  processReferralReward: (registrationId: string) =>
    supabase.rpc('process_referral_reward', { registration_id: registrationId }),

  adminGetReferralAnalytics: () => supabase.rpc('admin_get_referral_analytics'),

  adminGetAllReferrals: () =>
    supabase
      .from('referrals')
      .select('*, referrer:profiles!referrer_id(full_name, email, phone), referred:profiles!referred_id(full_name, email, phone)')
      .order('created_at', { ascending: false }),

  adminUpdateReferralStatus: (id: string, status: string) =>
    supabase.from('referrals').update({ status }).eq('id', id),

  // AGENT SYSTEM
  applyForAgent: () => supabase.rpc('apply_for_agent'),

  getAgentDashboard: () => supabase.rpc('get_agent_dashboard'),

  getAgentPricing: () => supabase.rpc('get_agent_pricing'),

  checkPermission: (permission: string) =>
    supabase.rpc('check_permission', { p_permission: permission }),

  getAgentApplications: () => supabase.from('agent_applications').select('*').order('created_at', { ascending: false }),

  adminGetAgentApplications: () => supabase.rpc('admin_get_agent_applications'),

  adminGetAgents: () => supabase.rpc('admin_get_agents'),

  approveAgentApplication: (applicationId: string, status: string, adminNotes?: string) =>
    supabase.rpc('approve_agent_application', {
      p_application_id: applicationId,
      p_status: status,
      p_admin_notes: adminNotes,
    }),

  adminToggleAgentStatus: (userId: string, status: string) =>
    supabase.rpc('admin_toggle_agent_status', {
      p_user_id: userId,
      p_status: status,
    }),

  getAgentTransactions: (agentId: string) =>
    supabase
      .from('agent_transactions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false }),

  getAgentApplication: (userId: string) =>
    supabase
      .from('agent_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

  getRolePermissions: () => supabase.from('role_permissions').select('*'),

  // SYSTEM SETTINGS (WhatsApp config)
  getSystemSettings: () =>
    supabase.from('system_settings').select('*'),

  getSystemSetting: (name: string) =>
    supabase.from('system_settings').select('setting_value').eq('setting_name', name).single(),

  upsertSystemSetting: (name: string, value: string) =>
    supabase.from('system_settings').upsert(
      { setting_name: name, setting_value: value },
      { onConflict: 'setting_name' }
    ),
};
