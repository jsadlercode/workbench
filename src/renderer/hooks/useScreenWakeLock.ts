/**
 * Keeps the screen awake while `active` (a focus timer running), with the Screen Wake Lock API.
 * The browser drops the lock when the window is hidden, so it is asked for again when the window
 * shows. Unsupported or refused requests are ignored: the lock is a nicety and never throws.
 */
import { useEffect } from 'react';

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const wakeLock = (navigator as Partial<Navigator>).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== 'function') return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const release = (lock: WakeLockSentinel | null) => {
      if (!lock || lock.released) return;
      try {
        lock.release().catch(() => {});
      } catch {
        // Already gone
      }
    };

    const request = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        const lock = await wakeLock.request('screen');
        if (disposed) {
          release(lock);
          return;
        }
        sentinel = lock;
      } catch {
        // Refused (hidden window, battery saver) or unsupported
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      release(sentinel);
      sentinel = null;
    };
  }, [active]);
}
