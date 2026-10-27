/**
 * The time to read a focus timer at. While the timer runs, the component re-renders each time
 * the remaining `mm:ss` changes (about once a second); a paused, ended or missing timer doesn't
 * tick at all, so idle windows don't re-render.
 */
import { useEffect, useState } from 'react';
import { focusClock, isFocusRunning, type FocusTimerTimes } from '../../shared/utils/focus';

/** Past the second boundary, so the shown second has changed when the tick lands */
const TICK_SLACK_MS = 20;

export function useFocusClock(timer: FocusTimerTimes | null): number {
  const [, setTick] = useState(0);
  const running = isFocusRunning(timer);

  useEffect(() => {
    if (!running || !timer) return;
    let handle: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // The next moment the remaining whole seconds go down by one
      const { remainingMs } = focusClock(timer, Date.now());
      const delay = (remainingMs % 1000 || 1000) + TICK_SLACK_MS;
      handle = setTimeout(() => {
        setTick((tick) => tick + 1);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(handle);
  }, [running, timer]);

  return Date.now();
}
