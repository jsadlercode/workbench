/**
 * Waiting on: a task the user can't move on until someone or something else does
 * (`TaskMetadata.waitingOn`, e.g. "House Labs reply", and `waitingSince`, when it started).
 * The card shows it as a chip, the board lists waiting tasks in their own bar, and Up next and
 * the focus picker push them back.
 *
 * Pure functions; the ones that count days take `now` (local time).
 */
import type { Task, TaskMetadata } from '../types/task';
import { getTaskColumn } from '../constants/task';

type WaitingTask = Pick<Task, 'metadata'>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether the task is waiting on someone or something (a non-empty `waitingOn`) */
export function isWaiting(task: WaitingTask): boolean {
  const waitingOn = task.metadata?.waitingOn;
  return typeof waitingOn === 'string' && waitingOn.trim() !== '';
}

/** When the task started waiting, or null when it isn't waiting or the time isn't a real one */
function waitingSinceDate(task: WaitingTask): Date | null {
  if (!isWaiting(task)) return null;
  const since = task.metadata?.waitingSince;
  if (!since) return null;
  const date = new Date(since);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calendar days the task has been waiting: 0 on the day it started, then 1, 2... Null when it
 * isn't waiting or has no start time.
 */
export function waitingDays(task: WaitingTask, now: Date): number | null {
  const since = waitingSinceDate(task);
  if (!since) return null;
  // Calendar days, counted in UTC so a daylight saving change doesn't shift them
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(since.getFullYear(), since.getMonth(), since.getDate())) / DAY_MS
  );
  return Math.max(0, days);
}

/** The waiting fields; an undefined one is removed from the task */
export interface WaitingChanges {
  waitingOn: string | undefined;
  waitingSince: string | undefined;
}

/**
 * The metadata to save when the "waiting on" text becomes `nextWaitingOn`. A task that starts
 * waiting starts its clock now; a waiting task whose text changes keeps its start time; empty
 * text clears both fields.
 */
export function waitingChanges(
  current: Pick<TaskMetadata, 'waitingOn' | 'waitingSince'> | undefined,
  nextWaitingOn: string | undefined,
  now: Date
): WaitingChanges {
  const waitingOn = nextWaitingOn?.trim() ?? '';
  if (!waitingOn) return { waitingOn: undefined, waitingSince: undefined };
  const task = { metadata: current };
  const since = waitingSinceDate(task);
  return { waitingOn, waitingSince: since ? current?.waitingSince : now.toISOString() };
}

type WaitingListTask = Pick<Task, 'status' | 'metadata'>;

/**
 * The tasks waiting on someone or something, longest waiting first, for the board's Waiting on
 * list. Done and archived tasks are left out; tasks without a start time come last, and `tasks`
 * keeps its order for ties.
 */
export function listWaiting<T extends WaitingListTask>(tasks: readonly T[]): T[] {
  return tasks
    .filter((task) => isWaiting(task) && !task.metadata?.archivedAt && getTaskColumn(task.status) !== 'done')
    .map((task, index) => ({ task, index, since: waitingSinceDate(task)?.getTime() ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.since === b.since ? a.index - b.index : a.since < b.since ? -1 : 1))
    .map(({ task }) => task);
}
