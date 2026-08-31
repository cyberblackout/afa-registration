import {
  profileApi,
  registrationApi,
  walletApi,
  orderApi,
  notificationApi,
  referralApi,
  agentApi,
  adminSettingsApi,
  adminCustomerApi,
  adminDashboardApi,
  adminReportsApi,
  adminPaymentApi,
  ticketApi,
  adminConfigApi,
  adminAuditApi,
  pushApi,
  pricingApi,
  settingsApi,
  auditApi,
  rolePermissionsApi,
  whatsappConfigApi,
  announcementsApi,
} from './api';
import { Profile } from '../types';

export const db = {
  // PROFILES
  getProfile: async (userId: string) => {
    const data = await profileApi.get(userId);
    return { data };
  },

  updateProfile: async (userId: string, data: Partial<Profile>) => {
    await profileApi.update({ user_id: userId, ...data });
    return { data: null };
  },

  uploadAvatar: async (userId: string, file: File) => {
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const result = await profileApi.uploadAvatar(file.name, base64);
    return { data: result };
  },

  // AUTH / ROLES
  getUserRole: async (userId: string) => {
    const data = await profileApi.getUserRole(userId);
    return { data };
  },

  isAdmin: async () => {
    const data = await profileApi.isAdmin();
    return { data: data ?? false };
  },

  getAllUsers: async () => {
    const data = await adminCustomerApi.list();
    return { data };
  },

  updateUserRole: async (userId: string, role: string) => {
    await adminCustomerApi.updateRole(userId, role);
    return { data: null };
  },

  // REGISTRATIONS
  getRegistrations: async (userId?: string) => {
    const data = await registrationApi.adminList(undefined, userId);
    return { data };
  },

  getRegistration: async (id: string) => {
    const data = await profileApi.getRegistration(id);
    return { data };
  },

  createRegistration: async (data: any) => {
    const result = await registrationApi.create(data) as any;
    return { data: result };
  },

  updateRegistrationStatus: async (id: string, status: string, adminNotes?: string, userMessage?: string) => {
    await registrationApi.adminUpdateStatus(id, status, adminNotes, userMessage);
    return { data: null };
  },

  addRegistrationTimeline: async (data: any) => {
    await registrationApi.adminAddTimeline(data.registration_id, data.status, data.note);
    return { data: null };
  },

  addRegistrationDocument: async (data: any) => {
    await registrationApi.adminAddDocument(data.registration_id, data.document_type, data.document_url, data.file_name);
    return { data: null };
  },

  updateDocumentStatus: async (id: string, status: string, adminNotes?: string) => {
    await registrationApi.adminUpdateDocumentStatus(id, status, adminNotes);
    return { data: null };
  },

  assignRegistrationAdmin: async (id: string, adminId: string) => {
    await registrationApi.adminAssignAdmin(id, adminId);
    return { data: null };
  },

  // WALLET
  getWalletBalance: async (userId: string) => {
    const data = await profileApi.getWalletBalance(userId);
    return { data };
  },

  getTransactions: async (userId: string) => {
    const data = await walletApi.getTransactions();
    return { data };
  },

  getAllTransactions: async () => {
    const data = await walletApi.adminListUsers();
    return { data };
  },

  creditWallet: async (userId: string, amount: number, description: string, reference?: string) => {
    await walletApi.adminCredit(userId, amount, description);
    return { data: null };
  },

  debitWallet: async (userId: string, amount: number, description: string) => {
    await walletApi.adminDebit(userId, amount, description);
    return { data: null };
  },

  // ORDERS
  getOrders: async (userId?: string) => {
    const data = await orderApi.list(userId);
    return { data };
  },

  updateOrderStatus: async (id: string, status: string) => {
    await orderApi.updateStatus(id, status);
    return { data: null };
  },

  // NOTIFICATIONS
  getNotifications: async (userId: string) => {
    const data = await notificationApi.list();
    return { data };
  },

  getUnreadCount: async (userId: string) => {
    const result = await notificationApi.unreadCount() as any;
    return { count: result.count };
  },

  markNotificationRead: async (id: string) => {
    await notificationApi.markRead(id);
    return { data: null };
  },

  markAllNotificationsRead: async (userId: string) => {
    await notificationApi.markAllRead();
    return { data: null };
  },

  deleteNotification: async (id: string) => {
    await notificationApi.delete(id);
    return { data: null };
  },

  createNotification: async (data: any) => {
    await notificationApi.adminSend(data.title, data.message, data.type || 'info', [data.user_id]);
    return { data: null };
  },

  // PRICING
  getPricing: async () => {
    const data = await pricingApi.get();
    return { data };
  },

  // SETTINGS
  getSettings: async () => {
    const data = await settingsApi.get();
    return { data };
  },

  getSetting: async (key: string) => {
    const value = await settingsApi.getSetting(key);
    return { data: { value } };
  },

  updateSetting: async (key: string, value: any) => {
    await adminSettingsApi.saveAppSettings({ [key]: typeof value === 'string' ? value : JSON.stringify(value) });
    return { data: null };
  },

  // AUDIT LOGS
  getAuditLogs: async () => {
    const data = await adminAuditApi.list();
    return { data };
  },

  createAuditLog: async (data: any) => {
    await auditApi.create(data);
    return { data: null };
  },

  // ANNOUNCEMENTS
  getActiveAnnouncements: async () => {
    const data = await announcementsApi.getActive();
    return { data };
  },

  getAnnouncements: async () => {
    const data = await adminConfigApi.getAnnouncements();
    return { data };
  },

  createAnnouncement: async (data: any) => {
    await adminConfigApi.createAnnouncement(data.title, data.message, data.active);
    return { data: null };
  },

  // WHATSAPP CONFIG
  getWhatsAppConfig: async () => {
    const data = await whatsappConfigApi.get();
    return { data };
  },

  updateWhatsAppConfig: async (key: string, value: string) => {
    await adminConfigApi.updateWhatsApp({ [key]: value });
    return { data: null };
  },

  // SUPPORT TICKETS
  getTickets: async (userId?: string) => {
    const data = await ticketApi.list();
    return { data };
  },

  createTicket: async (data: any) => {
    await ticketApi.create(data.subject, data.message, data.priority);
    return { data: null };
  },

  updateTicketStatus: async (id: string, status: string) => {
    await ticketApi.updateStatus(id, status);
    return { data: null };
  },

  // REFERRALS
  generateReferralCode: async () => {
    const data = await referralApi.generateCode();
    return { data };
  },

  getReferralStats: async () => {
    const data = await referralApi.getStats();
    return { data };
  },

  validateReferralCode: async (code: string) => {
    const data = await referralApi.validateCode(code);
    return { data };
  },

  getMyReferrals: async (userId: string) => {
    const data = await referralApi.getMyReferrals();
    return { data };
  },

  getMyReferralRewards: async (userId: string) => {
    const data = await referralApi.getMyRewards();
    return { data };
  },

  getMyReferralCode: async (userId: string) => {
    const data = await referralApi.getProfile() as any;
    return { data: { referral_code: data?.referral_code } };
  },

  createReferral: async (referralCode: string, deviceFingerprint?: string) => {
    const data = await referralApi.createReferral(referralCode, deviceFingerprint);
    return { data };
  },

  getMyReferralTransactions: async () => {
    const data = await referralApi.getMyReferralTransactions();
    return { data };
  },

  processReferralReward: async (registrationId: string) => {
    const data = await registrationApi.adminProcessReferralReward(registrationId);
    return { data };
  },

  adminGetReferralAnalytics: async () => {
    const data = await referralApi.adminAnalytics();
    return { data };
  },

  adminGetAllReferrals: async () => {
    const data = await referralApi.adminList();
    return { data };
  },

  adminUpdateReferralStatus: async (id: string, status: string) => {
    await referralApi.adminUpdateStatus(id, status);
    return { data: null };
  },

  // AGENT SYSTEM
  initiateAgentApplication: async () => {
    const data = await agentApi.initiateApplication();
    return { data };
  },

  getAgentDashboard: async () => {
    const data = await agentApi.getDashboard();
    return { data };
  },

  getAgentPricing: async () => {
    const data = await agentApi.getPricing();
    return { data };
  },

  checkPermission: async (permission: string) => {
    const data = await agentApi.checkPermission(permission);
    return { data };
  },

  getAgentApplications: async () => {
    const data = await agentApi.getApplications();
    return { data };
  },

  adminGetAgentApplications: async () => {
    const data = await agentApi.adminGetApplications();
    return { data };
  },

  adminGetAgents: async () => {
    const data = await agentApi.adminGetApplications();
    return { data };
  },

  approveAgentApplication: async (applicationId: string, status: string, adminNotes?: string) => {
    const data = await agentApi.adminApprove(applicationId, status, adminNotes);
    return { data };
  },

  adminToggleAgentStatus: async (userId: string, status: string) => {
    const data = await agentApi.adminToggleStatus(userId, status);
    return { data };
  },

  getAgentTransactions: async (agentId: string) => {
    const data = await agentApi.getTransactions(agentId);
    return { data };
  },

  getAgentApplication: async (userId: string) => {
    const data = await agentApi.getApplication(userId);
    return { data };
  },

  getRolePermissions: async () => {
    const data = await rolePermissionsApi.get();
    return { data };
  },

  // SYSTEM SETTINGS (WhatsApp config)
  getSystemSettings: async () => {
    const data = await adminConfigApi.getSystemSettings();
    return { data };
  },

  getSystemSetting: async (name: string) => {
    const settings = await adminConfigApi.getSystemSettings();
    const found = settings.find((s: any) => s.setting_name === name);
    return { data: found ? { setting_value: found.setting_value } : null };
  },

  upsertSystemSetting: async (name: string, value: string) => {
    await adminSettingsApi.saveSystemSettings({ [name]: value });
    return { data: null };
  },
};
