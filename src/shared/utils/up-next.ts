/**
 * Up next: which Backlog tasks to hand to agents next, each with the reasons it was picked.
 * The board's Up next bar shows the top ones and queues one in a click.
 *
 * A pure function of the tasks and `now` (local time), built on the planning helpers in
 * `task-planning.ts`: the planned week, the deadline and the flag.
 */
import type { Task } from '../types/task';
import { deadlineState, planHorizon, type DeadlineTone } from './task-planning';

/** Points each rule adds to a task's score */
export const UP_NEXT_SCORES = {
  carriedOver: 50,
  overdueHard: 60,
  overdueTarget: 25,
  /** Due in 7 days or less */
  dueSoonHard: 45,
  dueSoonTarget: 18,
  /** A hard deadline due in 8 to 21 days */
  dueLaterHard: 20,
  flagged: 30,
  thisWeek: 20,
  nextWeek: 4
} as const;

/** Why a task is suggested; the UI turns each into text (`tasks:upNext.reasons.*`) */
export type UpNextReasonKey =
  | 'carried_over'
  | 'overdue'
  | 'past_target'
  | 'due_today'
  | 'due_in_days'
  | 'flagged'
  | 'this_week'
  | 'next_week';

/**
 * A reason's color. `urgent` and `soon` are the deadline tones of `task-planning.ts` (red and
 * amber); `accent` is the app's accent color and `neutral` the muted label color.
 */
export type UpNextTone = NonNullable<DeadlineTone> | 'accent' | 'neutral';

export interface UpNextReason {
  key: UpNextReasonKey;
  tone: UpNextTone;
  /** Days until the deadline, for `due_in_days` */
  days?: number;
}

export interface UpNextSuggestion<T> {
  task: T;
  score: number;
  reasons: UpNextReason[];
}

type UpNextTask = Pick<Task, 'status' | 'metadata'>;

/** A task's score and reasons (the Backlog check is up to the caller) */
function scoreTask(task: UpNextTask, now: Date): { score: number; reasons: UpNextReason[] } {
  const reasons: UpNextReason[] = [];
  let score = 0;
  const horizon = planHorizon(task, now);

  if (horizon === 'carried_over') {
    score += UP_NEXT_SCORES.carriedOver;
    reasons.push({ key: 'carried_over', tone: 'soon' });
  }

  // The deadline counts once, at its nearest tier: passed, 7 days or less, or (hard only) 21 days or less
  const deadline = deadlineState(task, now);
  if (deadline) {
    const { hard, daysLeft } = deadline;
    const dueReason = (tone: UpNextTone): UpNextReason =>
      daysLeft === 0 ? { key: 'due_today', tone } : { key: 'due_in_days', tone, days: daysLeft };
    if (deadline.overdue) {
      score += hard ? UP_NEXT_SCORES.overdueHard : UP_NEXT_SCORES.overdueTarget;
      reasons.push(hard ? { key: 'overdue', tone: 'urgent' } : { key: 'past_target', tone: 'soon' });
    } else if (daysLeft <= 7) {
      score += hard ? UP_NEXT_SCORES.dueSoonHard : UP_NEXT_SCORES.dueSoonTarget;
      reasons.push(dueReason(hard ? 'urgent' : 'soon'));
    } else if (hard && daysLeft <= 21) {
      score += UP_NEXT_SCORES.dueLaterHard;
      reasons.push(dueReason('soon'));
    }
  }

  if (task.metadata?.flagged === true) {
    score += UP_NEXT_SCORES.flagged;
    reasons.push({ key: 'flagged', tone: 'accent' });
  }

  // The planned week is shown only when nothing else explains the pick
  if (horizon === 'this_week') {
    score += UP_NEXT_SCORES.thisWeek;
    if (reasons.length === 0) reasons.push({ key: 'this_week', tone: 'neutral' });
  } else if (horizon === 'next_week') {
    score += UP_NEXT_SCORES.nextWeek;
    if (reasons.length === 0) reasons.push({ key: 'next_week', tone: 'neutral' });
  }

  return { score, reasons };
}

/**
 * Backlog tasks worth starting next, highest score first. Archived tasks and tasks outside the
 * Backlog are left out, and so is any task scoring 0 or less. `tasks` comes in the Backlog's
 * rendered order, which breaks ties.
 */
export function suggestUpNext<T extends UpNextTask>(tasks: readonly T[], now: Date): UpNextSuggestion<T>[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === 'backlog' && !task.metadata?.archivedAt)
    .map(({ task, index }) => ({ task, index, ...scoreTask(task, now) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ task, score, reasons }) => ({ task, score, reasons }));
}
