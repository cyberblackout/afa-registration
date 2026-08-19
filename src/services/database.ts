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
  paymentConfigApi,
  announcementsApi,
} from './api';
import { Profile } from '../types';

export const db = {
  // PROFILES
  getProfile: async (userId: string) => {
    try {
      const data = await profileApi.get(userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateProfile: async (userId: string, data: Partial<Profile>) => {
    try {
      await profileApi.update({ user_id: userId, ...data });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  uploadAvatar: async (userId: string, file: File) => {
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const result = await profileApi.uploadAvatar(file.name, base64);
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // AUTH / ROLES
  getUserRole: async (userId: string) => {
    try {
      const data = await profileApi.getUserRole(userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  isAdmin: async () => {
    try {
      const data = await profileApi.isAdmin();
      return { data: data ?? false, error: null };
    } catch (error: any) {
      return { data: false, error: { message: error.message } };
    }
  },

  getAllUsers: async () => {
    try {
      const data = await adminCustomerApi.list();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateUserRole: async (userId: string, role: string) => {
    try {
      await adminCustomerApi.updateRole(userId, role);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // REGISTRATIONS
  getRegistrations: async (userId?: string) => {
    try {
      const data = await registrationApi.adminList(undefined, userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getRegistration: async (id: string) => {
    try {
      const data = await profileApi.getRegistration(id);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createRegistration: async (data: any) => {
    try {
      const result = await registrationApi.create(data) as any;
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateRegistrationStatus: async (id: string, status: string, adminNotes?: string, userMessage?: string) => {
    try {
      await registrationApi.adminUpdateStatus(id, status, adminNotes, userMessage);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  addRegistrationTimeline: async (data: any) => {
    try {
      await registrationApi.adminAddTimeline(data.registration_id, data.status, data.note);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  addRegistrationDocument: async (data: any) => {
    try {
      await registrationApi.adminAddDocument(data.registration_id, data.document_type, data.document_url, data.file_name);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateDocumentStatus: async (id: string, status: string, adminNotes?: string) => {
    try {
      await registrationApi.adminUpdateDocumentStatus(id, status, adminNotes);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  assignRegistrationAdmin: async (id: string, adminId: string) => {
    try {
      await registrationApi.adminAssignAdmin(id, adminId);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // WALLET
  getWalletBalance: async (userId: string) => {
    try {
      const data = await profileApi.getWalletBalance(userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getTransactions: async (userId: string) => {
    try {
      const data = await walletApi.getTransactions();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAllTransactions: async () => {
    try {
      const data = await walletApi.adminListUsers();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  creditWallet: async (userId: string, amount: number, description: string, reference?: string) => {
    try {
      await walletApi.adminCredit(userId, amount, description);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  debitWallet: async (userId: string, amount: number, description: string) => {
    try {
      await walletApi.adminDebit(userId, amount, description);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // ORDERS
  getOrders: async (userId?: string) => {
    try {
      const data = await orderApi.list(userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createOrder: async (data: any) => {
    try {
      const result = await orderApi.create(data.amount, data.description);
      return { data: result, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateOrderStatus: async (id: string, status: string) => {
    try {
      await orderApi.updateStatus(id, status);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // NOTIFICATIONS
  getNotifications: async (userId: string) => {
    try {
      const data = await notificationApi.list();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getUnreadCount: async (userId: string) => {
    try {
      const result = await notificationApi.unreadCount() as any;
      return { count: result.count, error: null };
    } catch (error: any) {
      return { count: 0, error: { message: error.message } };
    }
  },

  markNotificationRead: async (id: string) => {
    try {
      await notificationApi.markRead(id);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  markAllNotificationsRead: async (userId: string) => {
    try {
      await notificationApi.markAllRead();
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await notificationApi.delete(id);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createNotification: async (data: any) => {
    try {
      await notificationApi.adminSend(data.title, data.message, data.type || 'info', [data.user_id]);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // PRICING
  getPricing: async () => {
    try {
      const data = await pricingApi.get();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // SETTINGS
  getSettings: async () => {
    try {
      const data = await settingsApi.get();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getSetting: async (key: string) => {
    try {
      const value = await settingsApi.getSetting(key);
      return { data: { value }, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateSetting: async (key: string, value: any) => {
    try {
      await adminSettingsApi.saveAppSettings({ [key]: typeof value === 'string' ? value : JSON.stringify(value) });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // AUDIT LOGS
  getAuditLogs: async () => {
    try {
      const data = await adminAuditApi.list();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createAuditLog: async (data: any) => {
    try {
      await auditApi.create(data);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // ANNOUNCEMENTS
  getActiveAnnouncements: async () => {
    try {
      const data = await announcementsApi.getActive();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAnnouncements: async () => {
    try {
      const data = await adminConfigApi.getAnnouncements();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createAnnouncement: async (data: any) => {
    try {
      await adminConfigApi.createAnnouncement(data.title, data.message, data.active);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // WHATSAPP CONFIG
  getWhatsAppConfig: async () => {
    try {
      const data = await whatsappConfigApi.get();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateWhatsAppConfig: async (key: string, value: string) => {
    try {
      await adminConfigApi.updateWhatsApp({ [key]: value });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // PAYMENT CONFIG
  getPaymentConfig: async () => {
    try {
      const data = await paymentConfigApi.get();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updatePaymentConfig: async (key: string, value: string) => {
    try {
      await adminConfigApi.updatePayment({ [key]: value });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // SUPPORT TICKETS
  getTickets: async (userId?: string) => {
    try {
      const data = await ticketApi.list();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  createTicket: async (data: any) => {
    try {
      await ticketApi.create(data.subject, data.message, data.priority);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  updateTicketStatus: async (id: string, status: string) => {
    try {
      await ticketApi.updateStatus(id, status);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // REFERRALS
  generateReferralCode: async () => {
    try {
      const data = await referralApi.generateCode();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getReferralStats: async () => {
    try {
      const data = await referralApi.getStats();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  validateReferralCode: async (code: string) => {
    try {
      const data = await referralApi.validateCode(code);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getMyReferrals: async (userId: string) => {
    try {
      const data = await referralApi.getMyReferrals();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getMyReferralRewards: async (userId: string) => {
    try {
      const data = await referralApi.getMyRewards();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getMyReferralCode: async (userId: string) => {
    try {
      const data = await referralApi.getProfile() as any;
      return { data: { referral_code: data?.referral_code }, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  processReferralReward: async (registrationId: string) => {
    try {
      const data = await registrationApi.adminProcessReferralReward(registrationId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminGetReferralAnalytics: async () => {
    try {
      const data = await referralApi.adminAnalytics();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminGetAllReferrals: async () => {
    try {
      const data = await referralApi.adminList();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminUpdateReferralStatus: async (id: string, status: string) => {
    try {
      await referralApi.adminUpdateStatus(id, status);
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // AGENT SYSTEM
  initiateAgentApplication: async () => {
    try {
      const data = await agentApi.initiateApplication();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAgentDashboard: async () => {
    try {
      const data = await agentApi.getDashboard();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAgentPricing: async () => {
    try {
      const data = await agentApi.getPricing();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  checkPermission: async (permission: string) => {
    try {
      const data = await agentApi.checkPermission(permission);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAgentApplications: async () => {
    try {
      const data = await agentApi.getApplications();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminGetAgentApplications: async () => {
    try {
      const data = await agentApi.adminGetApplications();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminGetAgents: async () => {
    try {
      const data = await agentApi.adminGetApplications();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  approveAgentApplication: async (applicationId: string, status: string, adminNotes?: string) => {
    try {
      const data = await agentApi.adminApprove(applicationId, status, adminNotes);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  adminToggleAgentStatus: async (userId: string, status: string) => {
    try {
      const data = await agentApi.adminToggleStatus(userId, status);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAgentTransactions: async (agentId: string) => {
    try {
      const data = await agentApi.getTransactions(agentId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getAgentApplication: async (userId: string) => {
    try {
      const data = await agentApi.getApplication(userId);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getRolePermissions: async () => {
    try {
      const data = await rolePermissionsApi.get();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  // SYSTEM SETTINGS (WhatsApp config)
  getSystemSettings: async () => {
    try {
      const data = await adminConfigApi.getSystemSettings();
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  getSystemSetting: async (name: string) => {
    try {
      const settings = await adminConfigApi.getSystemSettings();
      const found = settings.find((s: any) => s.setting_name === name);
      return { data: found ? { setting_value: found.setting_value } : null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  upsertSystemSetting: async (name: string, value: string) => {
    try {
      await adminSettingsApi.saveSystemSettings({ [name]: value });
      return { data: null, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },
};
