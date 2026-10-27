/**
 * Focus mode: a timer the user runs on one task, with the task's "your steps" beside it, logged
 * on the task as a session (`TaskMetadata.focusSessions`) when it ends.
 *
 * Pure functions. The timer is kept as timestamps (ms), not counters, so it survives a reload and
 * reads the same in every component: each helper takes the timer and `now`.
 */
import type { FocusOutcome, FocusSession, Task } from '../types/task';
import { getTaskColumn } from '../constants/task';
import { getYourSteps } from './your-steps';
import { suggestUpNext } from './up-next';
import { isWaiting } from './waiting';

/** The lengths the picker offers, in minutes */
export const FOCUS_LENGTHS = [15, 25, 30, 45, 60] as const;

export type FocusLength = (typeof FOCUS_LENGTHS)[number];

export const DEFAULT_FOCUS_LENGTH: FocusLength = 25;

/** Minutes the +5 min button adds */
export const FOCUS_EXTEND_MINUTES = 5;

export const isFocusLength = (value: unknown): value is FocusLength =>
  FOCUS_LENGTHS.includes(value as FocusLength);

const MINUTE_MS = 60_000;

/** A focus timer's times, all in ms since the epoch */
export interface FocusTimerTimes {
  /** The length picked at the start */
  lengthMinutes: number;
  /** Minutes added since with +5 min */
  addedMinutes: number;
  startedAt: number;
  /** When the current pause began; null while running */
  pausedAt: number | null;
  /** Total time of the pauses that are over */
  pausedMs: number;
  /** When the timer ended (the scheduled end when time ran out); null until then */
  endedAt: number | null;
}

export interface FocusClock {
  /** The session's length (with +5s) */
  plannedMs: number;
  /** Time focused so far, without the pauses; at most `plannedMs` */
  focusedMs: number;
  /** Time left; 0 once time is up */
  remainingMs: number;
  /** Whether the full length has been focused */
  timeUp: boolean;
  /** `focusedMs` of `plannedMs`, from 0 to 1 */
  progress: number;
}

/** Whether the timer is counting down (not paused, not ended) */
export function isFocusRunning(timer: FocusTimerTimes | null | undefined): timer is FocusTimerTimes {
  return !!timer && timer.pausedAt === null && timer.endedAt === null;
}

export function focusPlannedMs(timer: Pick<FocusTimerTimes, 'lengthMinutes' | 'addedMinutes'>): number {
  return (timer.lengthMinutes + timer.addedMinutes) * MINUTE_MS;
}

/** The timer read at `now` (ignored once it is paused or ended) */
export function focusClock(timer: FocusTimerTimes, now: number): FocusClock {
  const plannedMs = focusPlannedMs(timer);
  // A paused or ended timer stands still at the moment it paused or ended
  const until = Math.min(timer.endedAt ?? now, timer.pausedAt ?? Number.POSITIVE_INFINITY);
  const elapsed = Math.max(0, until - timer.startedAt - timer.pausedMs);
  const focusedMs = Math.min(elapsed, plannedMs);
  return {
    plannedMs,
    focusedMs,
    remainingMs: plannedMs - focusedMs,
    timeUp: elapsed >= plannedMs,
    progress: plannedMs > 0 ? focusedMs / plannedMs : 1
  };
}

/** When a running timer's time runs out; null while it is paused or after it ended */
export function focusTimeUpAt(timer: FocusTimerTimes): number | null {
  if (!isFocusRunning(timer)) return null;
  return timer.startedAt + timer.pausedMs + focusPlannedMs(timer);
}

/** Remaining time as `mm:ss` (minutes not wrapped at 60), rounding part seconds up */
export function formatFocusClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** The session to log for an ended timer */
export function toFocusSession(timer: FocusTimerTimes, outcome: FocusOutcome, note?: string): FocusSession {
  const endedAt = timer.endedAt ?? Date.now();
  const { focusedMs } = focusClock({ ...timer, endedAt }, endedAt);
  const session: FocusSession = {
    startedAt: new Date(timer.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    focusedSeconds: Math.round(focusedMs / 1000),
    plannedMinutes: timer.lengthMinutes + timer.addedMinutes,
    outcome
  };
  const trimmed = note?.trim();
  if (trimmed) session.note = trimmed;
  return session;
}

type FocusSessionsTask = Pick<Task, 'metadata'>;

/** The task's sessions with one more at the end */
export function withFocusSession(task: FocusSessionsTask, session: FocusSession): FocusSession[] {
  const sessions = task.metadata?.focusSessions;
  return [...(Array.isArray(sessions) ? sessions : []), session];
}

export interface FocusSummary {
  count: number;
  focusedSeconds: number;
}

/** How many sessions a task has and how long they focused in all */
export function focusSummary(task: FocusSessionsTask): FocusSummary {
  const sessions = task.metadata?.focusSessions;
  if (!Array.isArray(sessions)) return { count: 0, focusedSeconds: 0 };
  const focusedSeconds = sessions.reduce(
    (sum, session) => sum + (Number.isFinite(session?.focusedSeconds) ? Math.max(0, session.focusedSeconds) : 0),
    0
  );
  return { count: sessions.length, focusedSeconds };
}

type FocusCandidateTask = Pick<Task, 'id' | 'status' | 'metadata' | 'claudeRun'>;

export interface FocusCandidates<T> {
  /**
   * Tasks with open "your steps", then the other tasks waiting in Human Review. Tasks waiting on
   * someone or something are left out: the user can't act on them yet
   */
  needsYou: T[];
  /** The Up next suggestions not already in `needsYou` */
  upNext: T[];
}

/**
 * The tasks the focus picker offers, in two groups. Archived tasks are left out; each task shows
 * once. `tasks` keeps its order within each group (Up next sorts by its own score, which pushes
 * waiting tasks back). A waiting task can still be focused on from its details.
 */
export function focusCandidates<T extends FocusCandidateTask>(tasks: readonly T[], now: Date): FocusCandidates<T> {
  const active = tasks.filter((task) => !task.metadata?.archivedAt);
  const actionable = active.filter((task) => !isWaiting(task));
  const withSteps = actionable.filter((task) => getYourSteps(task).open > 0);
  const stepIds = new Set(withSteps.map((task) => task.id));
  // Human Review's column also holds tasks with an open PR and failed ones
  const inReview = actionable.filter(
    (task) => !stepIds.has(task.id) && getTaskColumn(task.status) === 'human_review'
  );
  const needsYou = [...withSteps, ...inReview];
  const needsYouIds = new Set(needsYou.map((task) => task.id));
  const upNext = suggestUpNext(active, now)
    .map((suggestion) => suggestion.task)
    .filter((task) => !needsYouIds.has(task.id));
  return { needsYou, upNext };
}
