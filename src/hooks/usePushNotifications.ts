import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';

export function usePushNotifications(enabled: boolean) {
  const { user } = useAuthStore();
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  const getVapidKey = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'vapid_public_key')
      .single();
    return data?.value || null;
  }, []);

  const registerSw = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      swRef.current = reg;
      return reg;
    } catch {
      return null;
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!user || !('Notification' in window) || !('serviceWorker' in navigator)) return;

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg = await registerSw();
    if (!reg) return;

    const vapidKey = await getVapidKey();
    if (!vapidKey) return;

    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) {
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', existingSub.endpoint)
        .single();
      if (!existing) {
        await supabase.from('push_subscriptions').insert({
          user_id: user.id,
          endpoint: existingSub.endpoint,
          p256dh_key: existingSub.toJSON().keys!.p256dh,
          auth_key: existingSub.toJSON().keys!.auth,
        });
      }
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const subJSON = sub.toJSON();
    await supabase.from('push_subscriptions').insert({
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh_key: subJSON.keys!.p256dh,
      auth_key: subJSON.keys!.auth,
    });
  }, [user, registerSw, getVapidKey]);

  const unsubscribe = useCallback(async () => {
    if (!user || swRef.current) {
      const sub = await swRef.current?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint')
      .eq('user_id', user?.id);
    const endpoints = (subs || []).map(s => s.endpoint);
    if (endpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', endpoints);
    }
    swRef.current = null;
  }, [user]);

  useEffect(() => {
    if (enabled && user) {
      subscribe();
    } else if (!enabled && user) {
      unsubscribe();
    }
    return () => {
      if (!enabled) unsubscribe();
    };
  }, [enabled, user, subscribe, unsubscribe]);

  return { subscribe, unsubscribe };
}
