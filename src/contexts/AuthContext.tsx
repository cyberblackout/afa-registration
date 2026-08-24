import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';

const AUTH_INIT_TIMEOUT_MS = 12_000;
const RPC_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

interface AuthContextType {
  user: any;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: loading, setUser, setLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  const fetchProfile = useCallback(async () => {
    const { data: profileRows } = await withTimeout(
      supabase.rpc('get_my_profile') as any,
      RPC_TIMEOUT_MS,
      'get_my_profile',
    );
    const profile = profileRows?.[0] ?? null;
    return profile;
  }, []);

  useEffect(() => {
    const init = async () => {
      if (initialised.current) return;
      initialised.current = true;

      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession() as any,
          AUTH_INIT_TIMEOUT_MS,
          'getSession',
        );

        if (session?.user) {
          const existing = useAuthStore.getState();
          if (existing.user && existing.isAuthenticated) {
            setLoading(false);
            return;
          }

          try {
            const profile = await fetchProfile();
            if (profile) {
              setUser(profile as any, (profile.role ?? 'user') as 'user' | 'agent' | 'admin');
              setError(null);
            } else {
              setUser(null);
              setError('Profile not found. Please log in again.');
            }
          } catch (profileErr: any) {
            console.error('Auth profile fetch failed:', profileErr);
            setUser(null);
            setError('Failed to load profile. Please try again.');
          }
        } else {
          setUser(null);
        }
      } catch (initErr: any) {
        console.error('Auth init failed:', initErr);
        setLoading(false);
        setError('Connection timed out. Please check your network and try again.');
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setError(null);
        return;
      }

      if (event === 'SIGNED_IN') {
        if (session?.user) {
          try {
            const profile = await fetchProfile();
            if (profile) {
              setUser(profile as any, (profile.role ?? 'user') as 'user' | 'agent' | 'admin');
              setError(null);
            }
          } catch (err: any) {
            console.error('Auth onAuthStateChange profile fetch failed:', err);
          }
        }
      }

      if (event === 'TOKEN_REFRESHED') {
        const existing = useAuthStore.getState();
        if (existing.user && existing.isAuthenticated) {
          return;
        }
        if (session?.user) {
          try {
            const profile = await fetchProfile();
            if (profile) {
              setUser(profile as any, (profile.role ?? 'user') as 'user' | 'agent' | 'admin');
            }
          } catch (err: any) {
            console.error('Auth TOKEN_REFRESHED profile fetch failed:', err);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, setUser, setLoading]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
