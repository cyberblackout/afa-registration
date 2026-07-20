import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';

type UserRole = 'user' | 'agent' | 'admin' | null;

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole;
  setUser: (user: User | null, role?: UserRole) => void;
  setRole: (role: UserRole) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      role: null,
      setUser: (user, role) =>
        set({ user, isAuthenticated: !!user, isLoading: false, role: role ?? null }),
      setRole: (role) => set({ role }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () =>
        set({ user: null, isAuthenticated: false, isLoading: false, role: null }),
    }),
    {
      name: 'afa-auth',
      // Only persist user data, not loading state
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        role: state.role,
      }),
    }
  )
);
