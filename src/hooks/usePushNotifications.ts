import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { pushApi } from '../services/api';

export function usePushNotifications(enabled: boolean) {
  const { user } = useAuthStore();
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  const getVapidKey = useCallback(async (): Promise<string | null> => {
    return await pushApi.getVapidKey();
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
      const existing = await pushApi.checkSubscription(existingSub.endpoint);
      if (!existing) {
        const keys = existingSub.toJSON().keys!;
        await pushApi.subscribe(existingSub.endpoint, keys.p256dh, keys.auth);
      }
      return;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const subJSON = sub.toJSON();
    await pushApi.subscribe(sub.endpoint, subJSON.keys!.p256dh, subJSON.keys!.auth);
  }, [user, registerSw, getVapidKey]);

  const unsubscribe = useCallback(async () => {
    if (!user || swRef.current) {
      const sub = await swRef.current?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
    }

    await pushApi.unsubscribe();
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
