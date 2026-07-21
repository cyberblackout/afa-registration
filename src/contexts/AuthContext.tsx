import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';

interface AuthContextType {
  user: any;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: loading, setUser, setLoading } = useAuthStore();
  const initialised = useRef(false);

  useEffect(() => {
    // On mount: verify session matches persisted state
    const init = async () => {
      if (initialised.current) return;
      initialised.current = true;

      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // Session exists — fetch fresh profile only if we don't have user data
        const existing = useAuthStore.getState();
        if (existing.user && existing.isAuthenticated) {
          // Already have persisted data, just clear loading
          setLoading(false);
          return;
        }
        // No persisted data — fetch profile
        const { data: profileRows } = await supabase.rpc('get_my_profile');
        const profile = profileRows?.[0] ?? null;
        if (profile) {
          setUser(profile as any, (profile.role ?? 'user') as 'user' | 'agent' | 'admin');
        } else {
          setUser(null);
        }
      } else {
        // No session — clear any stale persisted data
        setUser(null);
      }
    };

    init().catch(() => setLoading(false));

    // Listen for auth changes (login/logout from other tabs, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        return;
      }

      // Only refresh profile on meaningful events
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          // Small delay to let the session settle
          const { data: profileRows } = await supabase.rpc('get_my_profile');
          const profile = profileRows?.[0] ?? null;
          if (profile) {
            setUser(profile as any, (profile.role ?? 'user') as 'user' | 'agent' | 'admin');
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
