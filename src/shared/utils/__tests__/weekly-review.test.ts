/**
 * The weekly review's week maths: when tasks were finished (task history, else updatedAt), what
 * was planned for a week (planned week, carried over, slipped weeks), unplanned and carried over
 * work, missed hard deadlines, focus time, the day and project breakdowns, and paging weeks.
 */
import { describe, it, expect } from 'vitest';
import type { FocusSession, TaskHistoryEntry, TaskMetadata, TaskStatus, WeeklyReview } from '../../types';
import {
  doneTimesFromHistory,
  finishedAt,
  isoWeekNumber,
  moveTarget,
  nextReviewWeek,
  plannedDonePercent,
  reviewTrend,
  summarizeWeek,
  taskKey,
  weekBounds,
  weekDays,
  type ReviewTask
} from '../weekly-review';
import { PLAN_LATER } from '../task-planning';

// Tuesday 27 Oct 2026, 14:00 local: this week runs Mon 26 Oct to Sun 1 Nov
const NOW = new Date(2026, 9, 27, 14, 0);
const THIS_WEEK = '2026-10-26';
const LAST_WEEK = '2026-10-19';
const TWO_WEEKS_AGO = '2026-10-12';

/** Local time on a day of October 2026 */
const oct = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0).getTime();

function task(
  id: string,
  status: TaskStatus,
  metadata: TaskMetadata = {},
  options: { projectId?: string; updatedAt?: Date } = {}
): ReviewTask {
  return {
    id,
    specId: id,
    projectId: options.projectId ?? 'p1',
    title: `Task ${id}`,
    status,
    metadata,
    updatedAt: options.updatedAt ?? NOW
  };
}

/** Done times keyed like the review keys them */
function doneAt(entries: [ReviewTask, number][]): Map<string, number> {
  return new Map(entries.map(([t, time]) => [taskKey(t), time]));
}

function session(startedAt: number, focusedSeconds: number, outcome: FocusSession['outcome'] = 'progress'): FocusSession {
  return {
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt + focusedSeconds * 1000).toISOString(),
    focusedSeconds,
    plannedMinutes: 25,
    outcome
  };
}

describe('doneTimesFromHistory', () => {
  const at = (day: number, hour = 12) => new Date(oct(day, hour)).toISOString();

  it('keeps the last time each task entered done, keyed by project', () => {
    const entries: TaskHistoryEntry[] = [
      { at: at(20), task: '001-a', status: 'in_progress' },
      { at: at(21), task: '001-a', status: 'done' },
      { at: at(22), task: '001-a', status: 'human_review' },
      { at: at(27, 9), task: '001-a', status: 'done' },
      { at: at(23), task: '002-b', status: 'done' }
    ];
    const times = doneTimesFromHistory('p1', entries);
    expect(times.get(taskKey({ projectId: 'p1', specId: '001-a' }))).toBe(oct(27, 9));
    expect(times.get(taskKey({ projectId: 'p1', specId: '002-b' }))).toBe(oct(23));
    expect(times.has(taskKey({ projectId: 'p2', specId: '001-a' }))).toBe(false);
  });

  it('counts a task that stays done over several entries as done at the first of them', () => {
    const entries: TaskHistoryEntry[] = [
      { at: at(21), task: '001-a', status: 'done' },
      { at: at(24), task: '001-a', status: 'done', state: 'done' }
    ];
    expect(doneTimesFromHistory('p1', entries).get(taskKey({ projectId: 'p1', specId: '001-a' }))).toBe(oct(21));
  });

  it('reads entries in time order and skips ones without a time or status', () => {
    const entries: TaskHistoryEntry[] = [
      { at: at(25), task: '001-a', status: 'done' },
      { at: at(22), task: '001-a', status: 'in_progress' },
      { at: 'not a time', task: '001-a', status: 'backlog' },
      { at: at(26), task: '001-a' }
    ];
    expect(doneTimesFromHistory('p1', entries).get(taskKey({ projectId: 'p1', specId: '001-a' }))).toBe(oct(25));
  });

  it('adds to an existing map', () => {
    const into = new Map([['x', 1]]);
    doneTimesFromHistory('p1', [{ at: at(21), task: '001-a', status: 'done' }], into);
    expect(into.size).toBe(2);
  });
});

describe('finishedAt', () => {
  it('uses the task history, falls back to updatedAt, and is null while not done', () => {
    const recorded = task('a', 'done', {}, { updatedAt: new Date(oct(27)) });
    const unrecorded = task('b', 'done', {}, { updatedAt: new Date(oct(22)) });
    const open = task('c', 'human_review');
    const times = doneAt([[recorded, oct(20)], [open, oct(21)]]);
    expect(finishedAt(recorded, times)).toBe(oct(20));
    expect(finishedAt(unrecorded, times)).toBe(oct(22));
    expect(finishedAt(open, times)).toBeNull();
  });

  it('reads an updatedAt that came over IPC as a string', () => {
    const t = { ...task('a', 'done'), updatedAt: new Date(oct(22)).toISOString() as unknown as Date };
    expect(finishedAt(t, new Map())).toBe(oct(22));
  });
});

describe('weeks', () => {
  it('runs from Monday midnight to the next Monday midnight, local time', () => {
    const { start, end } = weekBounds(THIS_WEEK);
    expect(start).toBe(new Date(2026, 9, 26).getTime());
    expect(end).toBe(new Date(2026, 10, 2).getTime());
  });

  it('lists the seven days, Monday first, across a month end', () => {
    expect(weekDays(THIS_WEEK)).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'
    ]);
  });

  it('numbers weeks the ISO way', () => {
    expect(isoWeekNumber(THIS_WEEK)).toBe(44);
    expect(isoWeekNumber('2025-12-29')).toBe(1);
    expect(isoWeekNumber('2026-12-28')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
    expect(isoWeekNumber('2021-01-04')).toBe(1);
    expect(isoWeekNumber('2020-12-28')).toBe(53);
  });

  it('pages forward up to this week only', () => {
    expect(nextReviewWeek(LAST_WEEK, NOW)).toBe(THIS_WEEK);
    expect(nextReviewWeek(THIS_WEEK, NOW)).toBeNull();
  });

  it('moves unfinished work to next week from this week, and to this week from a past week', () => {
    expect(moveTarget(THIS_WEEK, NOW)).toBe('next_week');
    expect(moveTarget(LAST_WEEK, NOW)).toBe('this_week');
  });
});

describe('summarizeWeek', () => {
  it('splits finished work into planned and unplanned, and counts planned work still open', () => {
    const plannedDone = task('planned-done', 'done', { plannedFor: THIS_WEEK });
    const unplanned = task('unplanned', 'done');
    const nextWeekDoneEarly = task('early', 'done', { plannedFor: '2026-11-02' });
    const open = task('open', 'in_progress', { plannedFor: THIS_WEEK });
    const notPlanned = task('backlog', 'backlog');
    const times = doneAt([[plannedDone, oct(26, 10)], [unplanned, oct(27, 9)], [nextWeekDoneEarly, oct(27, 11)]]);

    const summary = summarizeWeek([plannedDone, unplanned, nextWeekDoneEarly, open, notPlanned], times, THIS_WEEK, NOW);

    expect(summary.isCurrent).toBe(true);
    expect(summary.finished.map((f) => [f.task.id, f.planned])).toEqual([
      ['planned-done', true],
      ['unplanned', false],
      ['early', false]
    ]);
    expect(summary.plannedOpen.map((p) => p.task.id)).toEqual(['open']);
    expect(summary.stats).toEqual({
      done: 3,
      planned: 2,
      plannedDone: 1,
      unplanned: 2,
      carried: 1,
      focusSeconds: 0,
      sessions: 0,
      hardMissed: 0
    });
  });

  it('counts a task carried over from an earlier week as planned for every week since, until it is done', () => {
    const carried = task('carried', 'done', { plannedFor: TWO_WEEKS_AGO });
    const times = doneAt([[carried, oct(27)]]);

    const twoWeeksAgo = summarizeWeek([carried], times, TWO_WEEKS_AGO, NOW);
    const lastWeek = summarizeWeek([carried], times, LAST_WEEK, NOW);
    const thisWeek = summarizeWeek([carried], times, THIS_WEEK, NOW);

    expect(twoWeeksAgo.stats).toMatchObject({ planned: 1, carried: 1, plannedDone: 0 });
    // Finished after the week: still planned and not finished in it, with the time it was done
    expect(lastWeek.plannedOpen).toEqual([{ task: carried, finishedAt: oct(27) }]);
    expect(thisWeek.stats).toMatchObject({ planned: 1, plannedDone: 1, carried: 0, unplanned: 0 });
    // Not planned for a week before its planned week, and not after it was finished
    expect(summarizeWeek([carried], times, '2026-10-05', NOW).stats.planned).toBe(0);
    expect(summarizeWeek([carried], times, '2026-11-02', NOW).stats.planned).toBe(0);
  });

  it('counts the weeks a task slipped from as planned', () => {
    // Planned for last week, moved to next week before it was done
    const slipped = task('slipped', 'backlog', { plannedFor: '2026-11-02', slippedWeeks: [LAST_WEEK, THIS_WEEK] });
    expect(summarizeWeek([slipped], new Map(), LAST_WEEK, NOW).stats).toMatchObject({ planned: 1, carried: 1 });
    expect(summarizeWeek([slipped], new Map(), THIS_WEEK, NOW).stats).toMatchObject({ planned: 1, carried: 1 });
    expect(summarizeWeek([slipped], new Map(), TWO_WEEKS_AGO, NOW).stats.planned).toBe(0);

    // Finished this week after slipping from it: planned work done, not unplanned
    const doneAfterSlip = task('done-after-slip', 'done', { plannedFor: PLAN_LATER, slippedWeeks: [THIS_WEEK] });
    const summary = summarizeWeek([doneAfterSlip], doneAt([[doneAfterSlip, oct(27)]]), THIS_WEEK, NOW);
    expect(summary.stats).toMatchObject({ done: 1, plannedDone: 1, unplanned: 0 });
  });

  it('does not count work finished before the week as planned for it', () => {
    const early = task('early', 'done', { plannedFor: TWO_WEEKS_AGO });
    const summary = summarizeWeek([early], doneAt([[early, oct(14)]]), LAST_WEEK, NOW);
    expect(summary.stats).toMatchObject({ planned: 0, done: 0, carried: 0 });
  });

  it('counts archived tasks that were done, and leaves out ones put aside without being done', () => {
    const archivedDone = task('archived-done', 'done', { plannedFor: THIS_WEEK, archivedAt: '2026-10-27T13:00:00.000Z' });
    const putAside = task('put-aside', 'backlog', {
      plannedFor: THIS_WEEK,
      archivedAt: '2026-10-27T13:00:00.000Z',
      deadline: '2026-10-26',
      hardDeadline: true
    });
    const summary = summarizeWeek([archivedDone, putAside], doneAt([[archivedDone, oct(26)]]), THIS_WEEK, NOW);
    expect(summary.stats).toMatchObject({ done: 1, planned: 1, plannedDone: 1, carried: 0, hardMissed: 0 });
  });

  it('counts hard deadlines in the week that passed before the task was finished', () => {
    const missedOpen = task('missed-open', 'in_progress', { deadline: '2026-10-20', hardDeadline: true });
    const missedLate = task('missed-late', 'done', { deadline: '2026-10-21', hardDeadline: true });
    const onTheDay = task('on-the-day', 'done', { deadline: '2026-10-22', hardDeadline: true });
    const target = task('target', 'backlog', { deadline: '2026-10-20' });
    const otherWeek = task('other-week', 'backlog', { deadline: '2026-10-13', hardDeadline: true });
    const times = doneAt([[missedLate, oct(23)], [onTheDay, oct(22, 23)]]);

    const summary = summarizeWeek([missedOpen, missedLate, onTheDay, target, otherWeek], times, LAST_WEEK, NOW);
    expect(summary.hardMissed.map((t) => t.id)).toEqual(['missed-open', 'missed-late']);
    expect(summary.stats.hardMissed).toBe(2);
  });

  it("this week, counts only the hard deadlines before today", () => {
    const yesterday = task('yesterday', 'backlog', { deadline: '2026-10-26', hardDeadline: true });
    const today = task('today', 'backlog', { deadline: '2026-10-27', hardDeadline: true });
    const later = task('later', 'backlog', { deadline: '2026-10-30', hardDeadline: true });
    const summary = summarizeWeek([yesterday, today, later], new Map(), THIS_WEEK, NOW);
    expect(summary.hardMissed.map((t) => t.id)).toEqual(['yesterday']);
  });

  it('sums the focus sessions started in the week, by outcome and by day', () => {
    const a = task('a', 'in_progress', {
      focusSessions: [
        session(oct(26, 9), 1500, 'finished'),
        session(oct(26, 15), 600, 'stuck'),
        session(oct(18, 23), 900, 'finished')
      ]
    });
    const b = task('b', 'done', { focusSessions: [session(oct(28, 10), 1200, 'progress')] }, { projectId: 'p2' });

    const summary = summarizeWeek([a, b], new Map(), THIS_WEEK, NOW);
    expect(summary.focus).toEqual({ seconds: 3300, sessions: 3, finished: 1, progress: 1, stuck: 1 });
    expect(summary.stats).toMatchObject({ focusSeconds: 3300, sessions: 3 });
    expect(summary.days.map((d) => d.focusSeconds)).toEqual([2100, 0, 1200, 0, 0, 0, 0]);
  });

  it("buckets finished tasks by day in the order they were finished, and marks today", () => {
    const monLate = task('mon-late', 'done');
    const monEarly = task('mon-early', 'done');
    const sun = task('sun', 'done');
    const times = doneAt([[monLate, oct(26, 18)], [monEarly, oct(26, 8)], [sun, new Date(2026, 10, 1, 22).getTime()]]);

    const summary = summarizeWeek([monLate, monEarly, sun], times, THIS_WEEK, NOW);
    expect(summary.days.map((d) => d.tasks.map((t) => t.id))).toEqual([['mon-early', 'mon-late'], [], [], [], [], [], ['sun']]);
    expect(summary.days.map((d) => d.isToday)).toEqual([false, true, false, false, false, false, false]);
    expect(summary.finished.map((f) => f.day)).toEqual([0, 0, 6]);
    expect(summarizeWeek([], new Map(), LAST_WEEK, NOW).days.some((d) => d.isToday)).toBe(false);
  });

  it('breaks the week down by project, the most finished first', () => {
    const tasks = [
      task('a1', 'done', {}, { projectId: 'a' }),
      task('a2', 'backlog', { plannedFor: THIS_WEEK }, { projectId: 'a' }),
      task('b1', 'done', {}, { projectId: 'b' }),
      task('b2', 'done', { plannedFor: THIS_WEEK }, { projectId: 'b' }),
      task('c1', 'backlog', { plannedFor: LAST_WEEK }, { projectId: 'c' }),
      task('d1', 'backlog', {}, { projectId: 'd' })
    ];
    const summary = summarizeWeek(tasks, new Map(), THIS_WEEK, NOW);
    expect(summary.projects).toEqual([
      { projectId: 'b', done: 2, open: 0 },
      { projectId: 'a', done: 1, open: 1 },
      { projectId: 'c', done: 0, open: 1 }
    ]);
  });

  it('lists planned work still open with the earliest deadline first', () => {
    const none = task('none', 'backlog', { plannedFor: THIS_WEEK });
    const late = task('late', 'backlog', { plannedFor: THIS_WEEK, deadline: '2026-11-20' });
    const soon = task('soon', 'backlog', { plannedFor: THIS_WEEK, deadline: '2026-10-29' });
    const summary = summarizeWeek([none, late, soon], new Map(), THIS_WEEK, NOW);
    expect(summary.plannedOpen.map((p) => p.task.id)).toEqual(['soon', 'late', 'none']);
  });
});

describe('plannedDonePercent', () => {
  it('rounds to a whole percent and is null when nothing was planned', () => {
    expect(plannedDonePercent({ planned: 3, plannedDone: 2 })).toBe(67);
    expect(plannedDonePercent({ planned: 0, plannedDone: 0 })).toBeNull();
  });
});

describe('reviewTrend', () => {
  const stats = { done: 0, planned: 4, plannedDone: 3, unplanned: 0, carried: 1, focusSeconds: 0, sessions: 0, hardMissed: 0 };
  const review = (weekStart: string, overall?: WeeklyReview['overall']): WeeklyReview => ({
    weekStart,
    overall,
    wentWell: '',
    gotInTheWay: '',
    tryNext: '',
    stats,
    savedAt: '2026-10-25T18:00:00.000Z'
  });

  it('lists the eight weeks up to the last one, oldest first, with their reviews', () => {
    const trend = reviewTrend([review(LAST_WEEK, 4), review('2026-08-31', 2), review('2026-09-07')], THIS_WEEK);
    expect(trend.map((w) => w.week)).toEqual([
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'
    ]);
    expect(trend[0]).toMatchObject({ plannedDonePercent: 75, overall: null });
    expect(trend[6]).toMatchObject({ plannedDonePercent: 75, overall: 4 });
    expect(trend[7]).toEqual({ week: THIS_WEEK, review: null, plannedDonePercent: null, overall: null });
  });
});
