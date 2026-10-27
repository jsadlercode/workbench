/**
 * Focus mode's state: the running timer, whether the full-screen overlay shows, and the task the
 * picker starts on.
 *
 * The timer is kept as timestamps (see src/shared/utils/focus.ts) in sessionStorage: each window
 * has its own, and it survives a reload of that window. A timer whose time ran out while the
 * window was closed comes back ended at its scheduled end, waiting for "How did that go?".
 *
 * The last length picked is a separate app-wide preference in localStorage.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_FOCUS_LENGTH,
  FOCUS_EXTEND_MINUTES,
  focusClock,
  focusTimeUpAt,
  isFocusLength,
  type FocusLength,
  type FocusTimerTimes
} from '../../shared/utils/focus';

export interface FocusTimer extends FocusTimerTimes {
  projectId: string;
  taskId: string;
  /** The task's title at the start, shown when the task isn't in this window's store */
  taskTitle: string;
}

/** The task a timer runs on */
export interface FocusTask {
  projectId: string;
  taskId: string;
  taskTitle: string;
}

interface FocusState {
  timer: FocusTimer | null;
  /** The full-screen overlay is shown (hiding it keeps the timer running) */
  open: boolean;
  /** The task the picker selects first (from a task's details) */
  preselectedTaskId: string | null;
  /** The note typed at "How did that go?", kept while the overlay is hidden */
  note: string;

  /**
   * Shows the overlay: the running timer when there is one, else the picker with `taskId`
   * selected
   */
  openFocus: (taskId?: string) => void;
  hide: () => void;
  start: (task: FocusTask, lengthMinutes: number, now?: number) => void;
  pause: (now?: number) => void;
  resume: (now?: number) => void;
  /** +5 min */
  extend: () => void;
  /** Stop and log: ends the timer now and shows "How did that go?" */
  stop: (now?: number) => void;
  /** Time ran out: ends the timer at its scheduled end and shows the overlay */
  timeUp: (now?: number) => void;
  setNote: (note: string) => void;
  /** Drops the timer (logged, or Don't log), back to the picker */
  clear: (preselectedTaskId?: string | null) => void;
}

/** The timer from sessionStorage, if it has the shape of one */
function readTimer(value: unknown): FocusTimer | null {
  if (!value || typeof value !== 'object') return null;
  const timer = value as Partial<FocusTimer>;
  const isTime = (time: unknown) => typeof time === 'number' && Number.isFinite(time);
  const valid =
    typeof timer.projectId === 'string' &&
    typeof timer.taskId === 'string' &&
    typeof timer.taskTitle === 'string' &&
    isTime(timer.lengthMinutes) &&
    isTime(timer.addedMinutes) &&
    isTime(timer.startedAt) &&
    isTime(timer.pausedMs) &&
    (timer.pausedAt === null || isTime(timer.pausedAt)) &&
    (timer.endedAt === null || isTime(timer.endedAt));
  return valid ? (timer as FocusTimer) : null;
}

/** The timer ended at its scheduled end when its time is up at `now` */
function endIfTimeUp(timer: FocusTimer, now: number): FocusTimer {
  const end = focusTimeUpAt(timer);
  if (end === null || !focusClock(timer, now).timeUp) return timer;
  return { ...timer, endedAt: end };
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      timer: null,
      open: false,
      preselectedTaskId: null,
      note: '',

      openFocus: (taskId) =>
        set(get().timer ? { open: true } : { open: true, preselectedTaskId: taskId ?? null }),

      hide: () => set({ open: false }),

      start: (task, lengthMinutes, now = Date.now()) =>
        set({
          timer: {
            ...task,
            lengthMinutes,
            addedMinutes: 0,
            startedAt: now,
            pausedAt: null,
            pausedMs: 0,
            endedAt: null
          },
          open: true,
          preselectedTaskId: null,
          note: ''
        }),

      pause: (now = Date.now()) => {
        const { timer } = get();
        if (!timer || timer.pausedAt !== null || timer.endedAt !== null) return;
        set({ timer: { ...timer, pausedAt: now } });
      },

      resume: (now = Date.now()) => {
        const { timer } = get();
        if (!timer || timer.pausedAt === null || timer.endedAt !== null) return;
        set({ timer: { ...timer, pausedAt: null, pausedMs: timer.pausedMs + Math.max(0, now - timer.pausedAt) } });
      },

      extend: () => {
        const { timer } = get();
        if (!timer || timer.endedAt !== null) return;
        set({ timer: { ...timer, addedMinutes: timer.addedMinutes + FOCUS_EXTEND_MINUTES } });
      },

      stop: (now = Date.now()) => {
        const { timer } = get();
        if (!timer || timer.endedAt !== null) return;
        // A running timer that is already past its end ends there
        const ended = endIfTimeUp(timer, now);
        if (ended.endedAt !== null) {
          set({ timer: ended, open: true });
          return;
        }
        // A pause in progress counts as a pause
        const pausedMs = timer.pausedAt === null ? timer.pausedMs : timer.pausedMs + Math.max(0, now - timer.pausedAt);
        set({ timer: { ...timer, pausedAt: null, pausedMs, endedAt: now }, open: true });
      },

      timeUp: (now = Date.now()) => {
        const { timer } = get();
        if (!timer) return;
        // Not before the end (a paused or ended timer has none)
        const end = focusTimeUpAt(timer);
        if (end === null || now < end) return;
        set({ timer: { ...timer, endedAt: end }, open: true });
      },

      setNote: (note) => set({ note }),

      clear: (preselectedTaskId = null) => set({ timer: null, note: '', preselectedTaskId })
    }),
    {
      name: 'focus-timer',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ timer: state.timer, open: state.open, note: state.note }),
      merge: (persisted, current) => {
        if (!persisted) return current;
        const stored = persisted as Partial<Pick<FocusState, 'timer' | 'open' | 'note'>>;
        const timer = readTimer(stored.timer);
        if (!timer) return { ...current, timer: null, open: false, note: '' };
        // Time ran out while the window was closed: ended at the scheduled end, no chime
        const restored = endIfTimeUp(timer, Date.now());
        const timedOut = restored.endedAt !== null && timer.endedAt === null;
        return {
          ...current,
          timer: restored,
          open: timedOut || stored.open === true,
          note: typeof stored.note === 'string' ? stored.note : ''
        };
      }
    }
  )
);

interface FocusLengthState {
  /** The length last picked (25 minutes until the user picks another) */
  length: FocusLength;
  setLength: (length: FocusLength) => void;
}

/** Focus mode's last picked length, app-wide in localStorage like the board's preferences */
export const useFocusLengthStore = create<FocusLengthState>()(
  persist(
    (set) => ({
      length: DEFAULT_FOCUS_LENGTH,
      setLength: (length) => set({ length })
    }),
    {
      name: 'focus-length',
      partialize: (state) => ({ length: state.length }),
      // A stored length the picker doesn't offer keeps the default
      merge: (persisted, current) => {
        const length = (persisted as Partial<FocusLengthState> | undefined)?.length;
        return isFocusLength(length) ? { ...current, length } : current;
      }
    }
  )
);
