import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyedStorage } from './storage';
import { Outbox } from './outbox';

export interface UseOfflineCacheOptions<T, TMutation = unknown> {
  /** Unique key for this piece of cached data, e.g. `chat:${chatId}`. */
  key: string;
  /** Namespace so different features don't collide, e.g. 'novanotes-chat'. */
  namespace: string;
  /** Fetch the latest value from the network/backend. */
  fetchRemote?: () => Promise<T>;
  /** Send a queued mutation to the backend. Required if you call `mutate`. */
  sendMutation?: (mutation: TMutation) => Promise<void>;
  /** Apply a mutation optimistically to the local cached value. */
  applyMutation?: (current: T | null, mutation: TMutation) => T;
  /** Whether the device currently has connectivity. Defaults to true (always try). */
  isOnline?: boolean;
}

export interface UseOfflineCacheResult<T, TMutation = unknown> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Number of mutations waiting to be sent. */
  pendingCount: number;
  /** Re-fetch from the network and update the cache. */
  refresh: () => Promise<void>;
  /** Apply a mutation locally now, and queue it to be sent (immediately if online). */
  mutate: (mutation: TMutation) => Promise<void>;
  /** Manually retry sending anything queued. */
  flushOutbox: () => Promise<void>;
}

/**
 * Offline-first cache: reads instantly from AsyncStorage, refreshes from the
 * network when possible, and queues local mutations in a persistent outbox
 * so they survive app restarts and get sent once connectivity returns.
 */
export function useOfflineCache<T, TMutation = unknown>(
  options: UseOfflineCacheOptions<T, TMutation>
): UseOfflineCacheResult<T, TMutation> {
  const {
    key,
    namespace,
    fetchRemote,
    sendMutation,
    applyMutation,
    isOnline = true,
  } = options;

  const storageRef = useRef(new KeyedStorage(`cache:${namespace}`));
  const outboxRef = useRef(new Outbox<TMutation>(`${namespace}:${key}`));

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await outboxRef.current.size());
  }, []);

  const flushOutbox = useCallback(async () => {
    if (!sendMutation) return;
    await outboxRef.current.flush(sendMutation);
    await refreshPendingCount();
  }, [sendMutation, refreshPendingCount]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Show cached value immediately, then replace with fresh data.
      const cached = await storageRef.current.get<T>(key);
      if (cached != null) setData(cached);

      if (fetchRemote && isOnline) {
        const fresh = await fetchRemote();
        setData(fresh);
        await storageRef.current.set(key, fresh);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [key, fetchRemote, isOnline]);

  const mutate = useCallback(
    async (mutation: TMutation) => {
      if (applyMutation) {
        setData((current) => {
          const next = applyMutation(current, mutation);
          storageRef.current.set(key, next);
          return next;
        });
      }
      await outboxRef.current.enqueue(mutation);
      await refreshPendingCount();
      if (isOnline) {
        await flushOutbox();
      }
    },
    [applyMutation, key, isOnline, flushOutbox, refreshPendingCount]
  );

  useEffect(() => {
    refresh();
    refreshPendingCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Attempt to flush whenever connectivity comes back online.
  useEffect(() => {
    if (isOnline) {
      flushOutbox();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return { data, loading, error, pendingCount, refresh, mutate, flushOutbox };
}
