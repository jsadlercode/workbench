/**
 * Task planning: the week a task is planned for, its deadline and its flag
 * (`TaskMetadata.plannedFor`, `deadline`, `hardDeadline`, `flagged`), and how the Backlog groups
 * and sorts tasks by them.
 *
 * Pure functions in the computer's local time. Each takes `now`, so they can be tested and so a
 * board left open can move to the next day.
 */
import type { Task, TaskMetadata } from '../types/task';
import { formatShortDate } from './format-date-time';

/** `plannedFor` for "later", without a week */
export const PLAN_LATER = 'later';

/** Where a task's planned week falls from today */
export type PlanHorizon = 'carried_over' | 'this_week' | 'next_week' | 'later' | 'unplanned';

/** Backlog groups, in the order the column shows them */
export const PLAN_HORIZONS: readonly PlanHorizon[] = ['carried_over', 'this_week', 'next_week', 'later', 'unplanned'];

/** What the user can pick for a task's week (the task dialogs and the card menu) */
export type PlanChoice = 'unplanned' | 'this_week' | 'next_week' | 'later';

export const PLAN_CHOICES: readonly PlanChoice[] = ['unplanned', 'this_week', 'next_week', 'later'];

type PlanningTask = Pick<Task, 'metadata'>;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A local date as `YYYY-MM-DD` */
export function toDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` date, or null when it isn't a real date */
export function parseDateKey(key: string | undefined | null): Date | null {
  const match = key ? DATE_KEY.exec(key) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  // A day the month doesn't have (2026-02-30) rolls over into the next month
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

/** A `YYYY-MM-DD` date like "3 Nov" (with the year when it isn't this year), or empty when it isn't a date */
export function formatDateKey(key: string | undefined, now: Date): string {
  const date = parseDateKey(key);
  return date ? formatShortDate(date, now) : '';
}

/** The Monday of the week `date` falls in, as `YYYY-MM-DD` (weeks run Monday to Sunday) */
export function weekStart(date: Date): string {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday));
}

/** The Monday of the week `weeks` weeks after the week of `now` */
function weekStartAfter(now: Date, weeks: number): string {
  return weekStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + weeks * 7));
}

/**
 * The Monday of the week a task is planned for, or null when it isn't planned for a week (unset,
 * `'later'`, or not a date). A date that isn't a Monday counts as its week.
 */
export function plannedWeek(plannedFor: string | undefined): string | null {
  const date = parseDateKey(plannedFor);
  return date ? weekStart(date) : null;
}

/**
 * Where the task's planned week falls from today: a week before this one is carried over,
 * `'later'` and any week after next week are later, and anything else is not planned.
 */
export function planHorizon(task: PlanningTask, now: Date): PlanHorizon {
  const plannedFor = task.metadata?.plannedFor;
  if (plannedFor === PLAN_LATER) return 'later';
  const week = plannedWeek(plannedFor);
  if (!week) return 'unplanned';
  const thisWeek = weekStart(now);
  if (week < thisWeek) return 'carried_over';
  if (week === thisWeek) return 'this_week';
  return week === weekStartAfter(now, 1) ? 'next_week' : 'later';
}

/** The `plannedFor` a choice made today stores (undefined removes it) */
export function plannedForChoice(choice: PlanChoice, now: Date): string | undefined {
  switch (choice) {
    case 'this_week':
      return weekStart(now);
    case 'next_week':
      return weekStartAfter(now, 1);
    case 'later':
      return PLAN_LATER;
    default:
      return undefined;
  }
}

/**
 * The choice that matches a stored `plannedFor` today, or null when none does: a past week, or a
 * week after next week
 */
export function planChoiceOf(plannedFor: string | undefined, now: Date): PlanChoice | null {
  const horizon = planHorizon({ metadata: { plannedFor } }, now);
  if (horizon === 'carried_over') return null;
  if (horizon === 'later') return plannedFor === PLAN_LATER ? 'later' : null;
  return horizon;
}

/** How pressing a deadline is: urgent, soon, or neither */
export type DeadlineTone = 'urgent' | 'soon' | null;

export interface DeadlineState {
  /** The deadline, `YYYY-MM-DD` */
  date: string;
  /** A committed deadline rather than a target date */
  hard: boolean;
  /** Days from today to the deadline: 0 on the day, negative once it has passed */
  daysLeft: number;
  overdue: boolean;
  tone: DeadlineTone;
}

/**
 * The task's deadline from today, or null when it has none. A hard deadline is urgent when it has
 * passed or is 7 days or less away, and soon at 21 days or less; a target date is soon when it has
 * passed or is 7 days or less away.
 */
export function deadlineState(task: PlanningTask, now: Date): DeadlineState | null {
  const date = parseDateKey(task.metadata?.deadline);
  if (!date) return null;
  // Calendar days, counted in UTC so a daylight saving change doesn't shift them
  const daysLeft = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS
  );
  const hard = task.metadata?.hardDeadline === true;
  const tone: DeadlineTone = hard
    ? daysLeft <= 7 ? 'urgent' : daysLeft <= 21 ? 'soon' : null
    : daysLeft <= 7 ? 'soon' : null;
  return { date: toDateKey(date), hard, daysLeft, overdue: daysLeft < 0, tone };
}

/**
 * Tasks with the flagged ones first, then the nearest deadline (no deadline last), then the
 * order they came in (a stable sort)
 */
export function sortByPlanning<T extends PlanningTask>(tasks: readonly T[]): T[] {
  return tasks
    .map((task, index) => ({
      task,
      index,
      flagged: task.metadata?.flagged === true,
      deadline: parseDateKey(task.metadata?.deadline) ? task.metadata?.deadline : undefined
    }))
    .sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      if (a.deadline !== b.deadline) {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline < b.deadline ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

export interface BacklogGroup<T> {
  horizon: PlanHorizon;
  tasks: T[];
}

/**
 * The Backlog's tasks grouped by planned week (Carried over, This week, Next week, Later, Not
 * planned; empty groups left out), each group sorted by {@link sortByPlanning}. `tasks` comes in
 * the board's saved order, which breaks ties.
 */
export function groupBacklog<T extends PlanningTask>(tasks: readonly T[], now: Date): BacklogGroup<T>[] {
  const byHorizon = new Map<PlanHorizon, T[]>();
  for (const task of sortByPlanning(tasks)) {
    const horizon = planHorizon(task, now);
    const group = byHorizon.get(horizon);
    if (group) group.push(task);
    else byHorizon.set(horizon, [task]);
  }
  return PLAN_HORIZONS.filter((horizon) => byHorizon.has(horizon)).map((horizon) => ({
    horizon,
    tasks: byHorizon.get(horizon) ?? []
  }));
}

/** Whether any of the groups holds a planned task (the Backlog then shows group headings) */
export function hasPlannedGroups(groups: readonly BacklogGroup<unknown>[]): boolean {
  return groups.some((group) => group.horizon !== 'unplanned');
}

/** The planning fields of the task create and edit dialogs */
export interface PlanningFormValue {
  /** The chosen week, or null while the task keeps a week no choice gives (a past week, or one after next week) */
  when: PlanChoice | null;
  /** The stored `plannedFor`, kept as it is while `when` is null */
  plannedFor?: string;
  /** `YYYY-MM-DD`, or empty for no deadline */
  deadline: string;
  hardDeadline: boolean;
  flagged: boolean;
}

export const EMPTY_PLANNING_FORM: PlanningFormValue = {
  when: 'unplanned',
  deadline: '',
  hardDeadline: false,
  flagged: false
};

type PlanningMetadata = Pick<TaskMetadata, 'plannedFor' | 'deadline' | 'hardDeadline' | 'flagged'>;

/** The dialog's planning fields for a task's metadata */
export function planningFormValue(metadata: PlanningMetadata | undefined, now: Date): PlanningFormValue {
  const when = planChoiceOf(metadata?.plannedFor, now);
  const deadline = parseDateKey(metadata?.deadline) ? metadata?.deadline ?? '' : '';
  return {
    when,
    ...(when === null ? { plannedFor: metadata?.plannedFor } : {}),
    deadline,
    hardDeadline: !!deadline && metadata?.hardDeadline === true,
    flagged: metadata?.flagged === true
  };
}

/** Every planning field, undefined where the task has none */
export interface PlanningMetadataUpdate {
  plannedFor: string | undefined;
  deadline: string | undefined;
  hardDeadline: boolean | undefined;
  flagged: boolean | undefined;
}

/**
 * The metadata the dialog's planning fields save. Every field is present; an undefined one is
 * removed from the task, so clearing a field in the dialog clears it on disk.
 */
export function planningMetadata(value: PlanningFormValue, now: Date): PlanningMetadataUpdate {
  const deadline = parseDateKey(value.deadline) ? value.deadline : undefined;
  return {
    plannedFor: value.when === null ? value.plannedFor : plannedForChoice(value.when, now),
    deadline,
    hardDeadline: deadline && value.hardDeadline ? true : undefined,
    flagged: value.flagged ? true : undefined
  };
}

/**
 * The Monday `weeks` weeks after the week `week` falls in (`YYYY-MM-DD`; negative goes back), or
 * null when `week` isn't a date
 */
export function addWeeks(week: string, weeks: number): string | null {
  const date = parseDateKey(week);
  return date ? weekStart(new Date(date.getFullYear(), date.getMonth(), date.getDate() + weeks * 7)) : null;
}

/**
 * The weeks a task slips when its `plannedFor` changes (a task not done yet): moving it from week
 * A to a later week, to `'later'` or to not planned slips every week from A through this week, or
 * through the week before the new one when that comes first. Nothing slips when it wasn't planned
 * for a week, moves to an earlier week or the same one, or was planned for a week still to come.
 */
export function slipWeeks(oldPlannedFor: string | undefined, newPlannedFor: string | undefined, now: Date): string[] {
  const from = plannedWeek(oldPlannedFor);
  if (!from) return [];
  const to = plannedWeek(newPlannedFor);
  if (to && to <= from) return [];
  const thisWeek = weekStart(now);
  const beforeNew = to ? addWeeks(to, -1) : null;
  const last = beforeNew && beforeNew < thisWeek ? beforeNew : thisWeek;
  const weeks: string[] = [];
  for (let week: string | null = from; week && week <= last; week = addWeeks(week, 1)) weeks.push(week);
  return weeks;
}

/** The task's slipped weeks with more added: sorted, each once, dates only */
export function withSlippedWeeks(current: readonly string[] | undefined, added: readonly string[]): string[] {
  const weeks = [...(Array.isArray(current) ? current : []), ...added].filter((week) => parseDateKey(week) !== null);
  return [...new Set(weeks)].sort();
}
