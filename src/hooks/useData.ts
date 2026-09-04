import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '../services/database';
import { referralApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

const STALE_1M = 60 * 1000;
const STALE_2M = 2 * 60 * 1000;
const STALE_5M = 5 * 60 * 1000;

export function useProfile() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const r = await db.getProfile(user!.id);
      return r.data;
    },
    enabled: !!user,
    staleTime: STALE_1M,
  });
}

export function useIsAdmin() {
  const { user, isAuthenticated, role } = useAuthStore();
  return useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      const r = await db.isAdmin();
      return r.data ?? false;
    },
    enabled: isAuthenticated && !!user,
    staleTime: STALE_1M,
    initialData: role === 'admin' ? true : undefined,
  });
}

export function useRegistrations(userId?: string) {
  return useQuery({
    queryKey: ['registrations', userId],
    queryFn: async () => {
      const r = await db.getRegistrations(userId);
      return r.data || [];
    },
    staleTime: STALE_1M,
  });
}

export function useRegistration(id: string) {
  return useQuery({
    queryKey: ['registration', id],
    queryFn: async () => {
      const r = await db.getRegistration(id);
      return r.data;
    },
    enabled: !!id,
    staleTime: STALE_1M,
  });
}

export function useCreateRegistration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await db.createRegistration(data);
      return r.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registrations'] }),
  });
}

export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const r = await db.updateRegistrationStatus(id, status, adminNotes);
      return r.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['registrations'] }),
  });
}

export function useWalletBalance() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['walletBalance', user?.id],
    queryFn: async () => {
      const r = await db.getWalletBalance(user!.id);
      return Number(r.data?.wallet_balance ?? 0);
    },
    enabled: !!user,
    staleTime: STALE_1M,
  });
}

export function useTransactions(userId?: string) {
  return useQuery({
    queryKey: ['transactions', userId],
    queryFn: async () => {
      const r = await (userId ? db.getTransactions(userId) : db.getAllTransactions());
      return r.data || [];
    },
    staleTime: STALE_1M,
  });
}

export function useCreditWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; amount: number; description: string; reference?: string }) => {
      const r = await db.creditWallet(data.userId, data.amount, data.description, data.reference);
      return r.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walletBalance'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useOrders(userId?: string) {
  return useQuery({
    queryKey: ['orders', userId],
    queryFn: async () => {
      const r = await db.getOrders(userId);
      return r.data || [];
    },
    staleTime: STALE_1M,
  });
}

export function useNotifications() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const r = await db.getNotifications(user!.id);
      return r.data || [];
    },
    enabled: !!user,
    staleTime: STALE_1M,
  });
}

export function useUnreadCount() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['unreadCount', user?.id],
    queryFn: async () => {
      const r = await db.getUnreadCount(user!.id);
      return r.count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await db.markNotificationRead(id);
      return r.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await db.markAllNotificationsRead(user!.id);
      return r.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await db.deleteNotification(id);
      return r.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function usePricing() {
  return useQuery({
    queryKey: ['pricing'],
    queryFn: async () => {
      const r = await db.getPricing();
      return r.data || [];
    },
    staleTime: STALE_5M,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const r = await db.getSettings();
      return r.data || [];
    },
    staleTime: STALE_5M,
  });
}

export function useAllUsers() {
  return useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const r = await db.getAllUsers();
      return r.data || [];
    },
    staleTime: STALE_2M,
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['auditLogs'],
    queryFn: async () => {
      const r = await db.getAuditLogs();
      return r.data || [];
    },
    staleTime: STALE_2M,
  });
}

// ============================================================
// REFERRALS
// ============================================================

export function useReferralProfile() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['referral_profile', user?.id],
    queryFn: () => referralApi.getProfile(),
    enabled: !!user?.id,
    staleTime: STALE_1M,
  });
}

export function useReferralStats() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['referral_stats', user?.id],
    queryFn: () => referralApi.getStats(),
    enabled: !!user?.id,
    staleTime: STALE_1M,
  });
}

export function useReferralList() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['my_referrals', user?.id],
    queryFn: () => referralApi.getMyReferrals(),
    enabled: !!user?.id,
    staleTime: STALE_1M,
  });
}

export function useReferralRewards() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['referral_rewards', user?.id],
    queryFn: () => referralApi.getMyRewards(),
    enabled: !!user?.id,
    staleTime: STALE_1M,
  });
}

export function useReferralTransactions() {
  const { user } = useAuthStore();
  return useQuery({
    queryKey: ['referral-reward-transactions', user?.id],
    queryFn: () => referralApi.getMyReferralTransactions(),
    enabled: !!user?.id,
    staleTime: STALE_1M,
  });
}
