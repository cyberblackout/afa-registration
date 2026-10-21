import { useCallback, useEffect, useState } from 'react';
import { offlineQueue } from '../services/offlineQueue';

/**
 * Reactive binding to the offline action queue + connectivity state.
 * Automatically flushes the queue when the browser comes back online.
 */
export const useOfflineQueue = () => {
  const [pendingCount, setPendingCount] = useState(() => offlineQueue.getCount());
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => offlineQueue.subscribe(() => setPendingCount(offlineQueue.getCount())), []);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    setIsSyncing(true);
    try {
      return await offlineQueue.flush();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Auto-sync on reconnect and once on mount if actions are pending.
  useEffect(() => {
    const handleOnline = () => {
      void flush();
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine && offlineQueue.getCount() > 0) void flush();
    return () => window.removeEventListener('online', handleOnline);
  }, [flush]);

  return { pendingCount, isOnline, isSyncing, flush, enqueue: offlineQueue.enqueue };
};

export default useOfflineQueue;
