/**
 * The weekly review: what happened in one week (Monday to Sunday, local time) across every
 * project's tasks, from the tasks, the time each was finished and `now`.
 *
 * - Finished in week W: the task is done and last entered done during W (its task history), or,
 *   without a history entry, was last updated during W.
 * - Planned for W: not finished before W, and planned for W or an earlier week (still carried
 *   over), or W is one of the weeks it slipped from (`slippedWeeks`).
 * - Unplanned: finished in W but not planned for W. Carried over (Still open for this week):
 *   planned for W and not finished in W.
 * - Hard deadline missed: a hard deadline in W, before today, that the task wasn't finished by.
 * - Focus: the tasks' focus sessions started in W.
 *
 * Archived tasks still count as finished; an archived task that isn't done was put aside, so it
 * isn't planned, carried over or missing a deadline. Pure functions, so they can be tested.
 */
import type { FocusSession, Task, TaskHistoryEntry, WeeklyReview, WeeklyReviewStats } from '../types';
import { addWeeks, parseDateKey, plannedWeek, toDateKey, weekStart, type PlanChoice } from './task-planning';

export type ReviewTask = Pick<Task, 'id' | 'specId' | 'projectId' | 'title' | 'status' | 'metadata' | 'updatedAt'>;

/** When tasks were finished (ms since the epoch), by {@link taskKey} */
export type DoneTimes = ReadonlyMap<string, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A task's key across projects (spec ids repeat between projects) */
export function taskKey(task: Pick<Task, 'projectId' | 'specId'>): string {
  return `${task.projectId}\u0000${task.specId}`;
}

/**
 * The last time each of a project's tasks entered done, from its task history, added to `into`.
 * A task that stays done across several entries entered done at the first of them.
 */
export function doneTimesFromHistory(
  projectId: string,
  entries: readonly TaskHistoryEntry[],
  into: Map<string, number> = new Map()
): Map<string, number> {
  const ordered = entries
    .map((entry, index) => ({ entry, index, at: Date.parse(entry.at) }))
    .filter((item) => Number.isFinite(item.at) && typeof item.entry.task === 'string')
    .sort((a, b) => a.at - b.at || a.index - b.index);
  const lastStatus = new Map<string, string>();
  for (const { entry, at } of ordered) {
    if (!entry.status) continue;
    if (entry.status === 'done' && lastStatus.get(entry.task) !== 'done') {
      into.set(taskKey({ projectId, specId: entry.task }), at);
    }
    lastStatus.set(entry.task, entry.status);
  }
  return into;
}

/** When the task was finished, or null while it isn't done */
export function finishedAt(task: ReviewTask, doneTimes: DoneTimes): number | null {
  if (task.status !== 'done') return null;
  const recorded = doneTimes.get(taskKey(task));
  if (recorded !== undefined) return recorded;
  const updated = new Date(task.updatedAt).getTime();
  return Number.isFinite(updated) ? updated : null;
}

/** Local midnight of the week's Monday and of the Monday after it (ms) */
export function weekBounds(week: string): { start: number; end: number } {
  const monday = parseDateKey(week) ?? new Date(0);
  const start = monday.getTime();
  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();
  return { start, end };
}

/** The week's seven days, Monday first (`YYYY-MM-DD`) */
export function weekDays(week: string): string[] {
  const monday = parseDateKey(week) ?? new Date(0);
  return Array.from({ length: 7 }, (_, i) =>
    toDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
  );
}

/** Calendar days between two dates, counted in UTC so a daylight saving change doesn't shift them */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      DAY_MS
  );
}

/** The ISO 8601 week number of the week (1 to 53): week 1 holds the year's first Thursday */
export function isoWeekNumber(week: string): number {
  const monday = parseDateKey(week);
  if (!monday) return 0;
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const firstMonday = parseDateKey(weekStart(new Date(thursday.getFullYear(), 0, 4)));
  return firstMonday ? Math.floor(daysBetween(firstMonday, thursday) / 7) + 1 : 0;
}

/** The week after `week`, or null when that is after this week (the review has no weeks to come) */
export function nextReviewWeek(week: string, now: Date): string | null {
  const next = addWeeks(week, 1);
  return next && next <= weekStart(now) ? next : null;
}

/**
 * Where the review moves a week's unfinished tasks: next week from this week's review, this week
 * from a past week's
 */
export function moveTarget(week: string, now: Date): Extract<PlanChoice, 'this_week' | 'next_week'> {
  return week < weekStart(now) ? 'this_week' : 'next_week';
}

/** Set aside: archived without being done */
function isPutAside(task: ReviewTask): boolean {
  return !!task.metadata?.archivedAt && task.status !== 'done';
}

/** Whether the task was planned for the week, given when it was finished */
export function isPlannedFor(task: ReviewTask, week: string, finished: number | null): boolean {
  if (isPutAside(task)) return false;
  if (finished !== null && finished < weekBounds(week).start) return false;
  const planned = plannedWeek(task.metadata?.plannedFor);
  if (planned && planned <= week) return true;
  const slipped = task.metadata?.slippedWeeks;
  return Array.isArray(slipped) && slipped.includes(week);
}

function validSessions(task: ReviewTask): FocusSession[] {
  const sessions = task.metadata?.focusSessions;
  return Array.isArray(sessions) ? sessions.filter((session) => session && Number.isFinite(Date.parse(session.startedAt))) : [];
}

function sessionSeconds(session: FocusSession): number {
  return Number.isFinite(session.focusedSeconds) ? Math.max(0, session.focusedSeconds) : 0;
}

/** Monday 0 to Sunday 6, for a time in the week */
function dayIndex(time: number): number {
  return (new Date(time).getDay() + 6) % 7;
}

export interface FinishedTask<T> {
  task: T;
  finishedAt: number;
  /** Monday 0 to Sunday 6 */
  day: number;
  /** Planned for the week (otherwise unplanned) */
  planned: boolean;
}

export interface PlannedOpenTask<T> {
  task: T;
  /** When it was finished after the week; null while it is still open */
  finishedAt: number | null;
}

export interface ReviewDay<T> {
  /** `YYYY-MM-DD` */
  date: string;
  /** Tasks finished that day, in the order they were finished */
  tasks: T[];
  /** Focus time of the sessions started that day */
  focusSeconds: number;
  isToday: boolean;
}

/** One project's share of the week */
export interface ProjectWork {
  projectId: string;
  /** Tasks finished in the week */
  done: number;
  /** Planned tasks not finished in the week */
  open: number;
}

export interface FocusWeek {
  seconds: number;
  sessions: number;
  finished: number;
  progress: number;
  stuck: number;
}

export interface WeekSummary<T> {
  /** The week's Monday */
  week: string;
  isCurrent: boolean;
  /** Finished in the week, in the order they were finished */
  finished: FinishedTask<T>[];
  /** Planned for the week and not finished in it, the earliest deadline first */
  plannedOpen: PlannedOpenTask<T>[];
  hardMissed: T[];
  /** Monday to Sunday */
  days: ReviewDay<T>[];
  /** The projects with work in the week, the most finished first */
  projects: ProjectWork[];
  focus: FocusWeek;
  stats: WeeklyReviewStats;
}

/** What happened in the week across the tasks (see the module comment for the rules) */
export function summarizeWeek<T extends ReviewTask>(
  tasks: readonly T[],
  doneTimes: DoneTimes,
  week: string,
  now: Date
): WeekSummary<T> {
  const { start, end } = weekBounds(week);
  const dates = weekDays(week);
  const today = toDateKey(now);
  const days: ReviewDay<T>[] = dates.map((date) => ({ date, tasks: [], focusSeconds: 0, isToday: date === today }));
  const finished: FinishedTask<T>[] = [];
  const plannedOpen: PlannedOpenTask<T>[] = [];
  const hardMissed: T[] = [];
  const focus: FocusWeek = { seconds: 0, sessions: 0, finished: 0, progress: 0, stuck: 0 };
  const projectOrder: string[] = [];
  const projects = new Map<string, ProjectWork>();
  const projectWork = (projectId: string): ProjectWork => {
    let work = projects.get(projectId);
    if (!work) {
      work = { projectId, done: 0, open: 0 };
      projects.set(projectId, work);
      projectOrder.push(projectId);
    }
    return work;
  };

  for (const task of tasks) {
    const doneAt = finishedAt(task, doneTimes);
    const planned = isPlannedFor(task, week, doneAt);
    const finishedInWeek = doneAt !== null && doneAt >= start && doneAt < end;

    if (finishedInWeek) {
      finished.push({ task, finishedAt: doneAt, day: dayIndex(doneAt), planned });
      projectWork(task.projectId).done += 1;
    } else if (planned) {
      plannedOpen.push({ task, finishedAt: doneAt });
      projectWork(task.projectId).open += 1;
    }

    const deadline = task.metadata?.deadline;
    if (
      task.metadata?.hardDeadline === true &&
      !isPutAside(task) &&
      parseDateKey(deadline) &&
      deadline! >= dates[0] &&
      deadline! <= dates[6] &&
      deadline! < today &&
      (doneAt === null || toDateKey(new Date(doneAt)) > deadline!)
    ) {
      hardMissed.push(task);
    }

    for (const session of validSessions(task)) {
      const started = Date.parse(session.startedAt);
      if (started < start || started >= end) continue;
      const seconds = sessionSeconds(session);
      focus.seconds += seconds;
      focus.sessions += 1;
      if (session.outcome === 'finished') focus.finished += 1;
      else if (session.outcome === 'stuck') focus.stuck += 1;
      else if (session.outcome === 'progress') focus.progress += 1;
      days[dayIndex(started)].focusSeconds += seconds;
    }
  }

  finished.sort((a, b) => a.finishedAt - b.finishedAt);
  for (const item of finished) days[item.day].tasks.push(item.task);
  plannedOpen.sort((a, b) => {
    const da = parseDateKey(a.task.metadata?.deadline) ? a.task.metadata?.deadline : undefined;
    const db = parseDateKey(b.task.metadata?.deadline) ? b.task.metadata?.deadline : undefined;
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  });

  const plannedDone = finished.filter((item) => item.planned).length;
  const stats: WeeklyReviewStats = {
    done: finished.length,
    planned: plannedDone + plannedOpen.length,
    plannedDone,
    unplanned: finished.length - plannedDone,
    carried: plannedOpen.length,
    focusSeconds: focus.seconds,
    sessions: focus.sessions,
    hardMissed: hardMissed.length
  };

  const projectList = projectOrder
    .map((id, index) => ({ work: projects.get(id)!, index }))
    .sort((a, b) => b.work.done - a.work.done || b.work.open - a.work.open || a.index - b.index)
    .map(({ work }) => work);

  return {
    week,
    isCurrent: week === weekStart(now),
    finished,
    plannedOpen,
    hardMissed,
    days,
    projects: projectList,
    focus,
    stats
  };
}

/** Planned work finished, as a whole percent; null when nothing was planned */
export function plannedDonePercent(stats: Pick<WeeklyReviewStats, 'planned' | 'plannedDone'>): number | null {
  return stats.planned > 0 ? Math.round((stats.plannedDone / stats.planned) * 100) : null;
}

export interface TrendWeek {
  week: string;
  review: WeeklyReview | null;
  /** From the review's figures; null without a review or when nothing was planned */
  plannedDonePercent: number | null;
  /** The review's Overall rating, 1 to 5 */
  overall: number | null;
}

/** The `count` weeks up to and including `lastWeek`, oldest first, with their saved reviews */
export function reviewTrend(reviews: readonly WeeklyReview[], lastWeek: string, count = 8): TrendWeek[] {
  const byWeek = new Map(reviews.map((review) => [review.weekStart, review]));
  const weeks: TrendWeek[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const week = addWeeks(lastWeek, -i);
    if (!week) continue;
    const review = byWeek.get(week) ?? null;
    weeks.push({
      week,
      review,
      plannedDonePercent: review ? plannedDonePercent(review.stats) : null,
      overall: review?.overall ?? null
    });
  }
  return weeks;
}
