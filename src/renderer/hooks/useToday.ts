/**
 * Today in local time (midnight), for the task planning helpers. Components re-render when the
 * day changes: at midnight, or when the window gets focus after the computer slept past it. So a
 * board left open moves this week's tasks to Carried over on Monday and keeps deadline tones current.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { parseDateKey, toDateKey } from '../../shared/utils/task-planning';

const listeners = new Set<() => void>();
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function scheduleMidnight(): void {
  const now = new Date();
  // A second past midnight, so the new day has begun when it fires
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  midnightTimer = setTimeout(() => {
    notify();
    scheduleMidnight();
  }, next.getTime() - now.getTime());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    scheduleMidnight();
    window.addEventListener('focus', notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (midnightTimer) clearTimeout(midnightTimer);
      midnightTimer = null;
      window.removeEventListener('focus', notify);
    }
  };
}

const getTodayKey = (): string => toDateKey(new Date());

/** Local midnight of today; a new Date only when the day changes */
export function useToday(): Date {
  const key = useSyncExternalStore(subscribe, getTodayKey);
  return useMemo(() => parseDateKey(key) ?? new Date(), [key]);
}
