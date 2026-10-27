import { describe, it, expect } from 'vitest';
import {
  weekStart,
  parseDateKey,
  planHorizon,
  plannedForChoice,
  planChoiceOf,
  deadlineState,
  sortByPlanning,
  groupBacklog,
  hasPlannedGroups,
  formatDateKey,
  planningFormValue,
  planningMetadata,
  EMPTY_PLANNING_FORM,
  PLAN_LATER
} from '../task-planning';
import type { TaskMetadata } from '../../types/task';

// Local dates: Wednesday 28 Oct 2026 (this week runs Mon 26 Oct to Sun 1 Nov)
const NOW = new Date(2026, 9, 28, 15, 30);

function task(id: string, metadata: TaskMetadata = {}) {
  return { id, metadata };
}

describe('weekStart', () => {
  it('returns the Monday of the week for every day of it', () => {
    for (let day = 26; day <= 31; day++) {
      expect(weekStart(new Date(2026, 9, day))).toBe('2026-10-26');
    }
    expect(weekStart(new Date(2026, 9, 26, 0, 0))).toBe('2026-10-26');
  });

  it('counts Sunday as the last day of the week', () => {
    expect(weekStart(new Date(2026, 10, 1, 23, 59))).toBe('2026-10-26');
    expect(weekStart(new Date(2026, 10, 2))).toBe('2026-11-02');
  });

  it('crosses a year boundary', () => {
    // Thursday 1 Jan 2026 is in the week starting Monday 29 Dec 2025
    expect(weekStart(new Date(2026, 0, 1))).toBe('2025-12-29');
    expect(weekStart(new Date(2026, 0, 4))).toBe('2025-12-29');
    expect(weekStart(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseDateKey', () => {
  it('reads a local date and rejects anything else', () => {
    const date = parseDateKey('2026-11-03');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(3);
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('later')).toBeNull();
    expect(parseDateKey('')).toBeNull();
    expect(parseDateKey(undefined)).toBeNull();
  });
});

describe('planHorizon', () => {
  it('places each kind of week', () => {
    expect(planHorizon(task('a', { plannedFor: '2026-10-19' }), NOW)).toBe('carried_over');
    expect(planHorizon(task('a', { plannedFor: '2025-12-29' }), NOW)).toBe('carried_over');
    expect(planHorizon(task('a', { plannedFor: '2026-10-26' }), NOW)).toBe('this_week');
    expect(planHorizon(task('a', { plannedFor: '2026-11-02' }), NOW)).toBe('next_week');
    expect(planHorizon(task('a', { plannedFor: '2026-11-09' }), NOW)).toBe('later');
    expect(planHorizon(task('a', { plannedFor: PLAN_LATER }), NOW)).toBe('later');
    expect(planHorizon(task('a'), NOW)).toBe('unplanned');
    expect(planHorizon({ metadata: undefined }, NOW)).toBe('unplanned');
    expect(planHorizon(task('a', { plannedFor: 'soon' }), NOW)).toBe('unplanned');
  });

  it('reads a date that is not a Monday as its week', () => {
    expect(planHorizon(task('a', { plannedFor: '2026-11-01' }), NOW)).toBe('this_week');
    expect(planHorizon(task('a', { plannedFor: '2026-10-25' }), NOW)).toBe('carried_over');
  });

  it('moves this week to carried over when the next week starts', () => {
    const planned = task('a', { plannedFor: '2026-10-26' });
    expect(planHorizon(planned, new Date(2026, 10, 1, 23, 59))).toBe('this_week');
    expect(planHorizon(planned, new Date(2026, 10, 2, 0, 0))).toBe('carried_over');
  });

  it('handles next week across a year boundary', () => {
    const lastWeekOfYear = new Date(2026, 11, 30);
    expect(planHorizon(task('a', { plannedFor: '2027-01-04' }), lastWeekOfYear)).toBe('next_week');
    expect(planHorizon(task('a', { plannedFor: '2026-12-28' }), lastWeekOfYear)).toBe('this_week');
  });
});

describe('plannedForChoice and planChoiceOf', () => {
  it('stores the Monday for this and next week, later, or nothing', () => {
    expect(plannedForChoice('this_week', NOW)).toBe('2026-10-26');
    expect(plannedForChoice('next_week', NOW)).toBe('2026-11-02');
    expect(plannedForChoice('later', NOW)).toBe(PLAN_LATER);
    expect(plannedForChoice('unplanned', NOW)).toBeUndefined();
  });

  it('finds the choice for a stored week, or none for a past or far week', () => {
    expect(planChoiceOf('2026-10-26', NOW)).toBe('this_week');
    expect(planChoiceOf('2026-11-02', NOW)).toBe('next_week');
    expect(planChoiceOf(PLAN_LATER, NOW)).toBe('later');
    expect(planChoiceOf(undefined, NOW)).toBe('unplanned');
    expect(planChoiceOf('2026-10-19', NOW)).toBeNull();
    expect(planChoiceOf('2026-11-16', NOW)).toBeNull();
  });
});

describe('deadlineState', () => {
  const at = (deadline: string, hardDeadline?: boolean) => deadlineState(task('a', { deadline, hardDeadline }), NOW);

  it('is null without a valid deadline', () => {
    expect(deadlineState(task('a'), NOW)).toBeNull();
    expect(deadlineState(task('a', { deadline: 'tomorrow' }), NOW)).toBeNull();
  });

  it('counts calendar days and marks a passed deadline overdue', () => {
    expect(at('2026-10-28')).toMatchObject({ daysLeft: 0, overdue: false });
    expect(at('2026-10-29')).toMatchObject({ daysLeft: 1, overdue: false });
    expect(at('2026-10-27')).toMatchObject({ daysLeft: -1, overdue: true });
    // Across the end of daylight saving time in many zones (early November)
    expect(at('2026-11-10')).toMatchObject({ daysLeft: 13 });
  });

  it('gives a hard deadline urgent at 7 days or less and soon at 21 days or less', () => {
    expect(at('2026-10-20', true)?.tone).toBe('urgent');
    expect(at('2026-11-04', true)?.tone).toBe('urgent');
    expect(at('2026-11-05', true)?.tone).toBe('soon');
    expect(at('2026-11-18', true)?.tone).toBe('soon');
    expect(at('2026-11-19', true)?.tone).toBeNull();
    expect(at('2026-11-04', true)?.hard).toBe(true);
  });

  it('gives a target date soon at 7 days or less and nothing after', () => {
    expect(at('2026-10-20')?.tone).toBe('soon');
    expect(at('2026-11-04')?.tone).toBe('soon');
    expect(at('2026-11-05')?.tone).toBeNull();
    expect(at('2026-11-04')?.hard).toBe(false);
  });
});

describe('sortByPlanning', () => {
  it('puts flagged first, then the nearest deadline, then keeps the input order', () => {
    const tasks = [
      task('plain-1'),
      task('late-deadline', { deadline: '2026-12-01' }),
      task('flagged-plain', { flagged: true }),
      task('plain-2'),
      task('near-deadline', { deadline: '2026-11-01' }),
      task('flagged-deadline', { flagged: true, deadline: '2026-11-20' }),
      task('bad-deadline', { deadline: 'soon' })
    ];
    expect(sortByPlanning(tasks).map((t) => t.id)).toEqual([
      'flagged-deadline',
      'flagged-plain',
      'near-deadline',
      'late-deadline',
      'plain-1',
      'plain-2',
      'bad-deadline'
    ]);
  });

  it('keeps tasks that tie in their input order', () => {
    const tasks = ['c', 'a', 'b'].map((id) => task(id, { flagged: true, deadline: '2026-11-01' }));
    expect(sortByPlanning(tasks).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('groupBacklog', () => {
  it('groups by week in order, skips empty groups and sorts each group', () => {
    const tasks = [
      task('unplanned-1'),
      task('this-1', { plannedFor: '2026-10-26' }),
      task('later-1', { plannedFor: PLAN_LATER }),
      task('this-2', { plannedFor: '2026-10-26', flagged: true }),
      task('carried-1', { plannedFor: '2026-10-12' }),
      task('far-1', { plannedFor: '2026-12-07', deadline: '2026-11-30' }),
      task('unplanned-2', { deadline: '2026-11-03' })
    ];
    const groups = groupBacklog(tasks, NOW);
    expect(groups.map((g) => [g.horizon, g.tasks.map((t) => t.id)])).toEqual([
      ['carried_over', ['carried-1']],
      ['this_week', ['this-2', 'this-1']],
      ['later', ['far-1', 'later-1']],
      ['unplanned', ['unplanned-2', 'unplanned-1']]
    ]);
    expect(hasPlannedGroups(groups)).toBe(true);
  });

  it('returns one Not planned group, still sorted, when nothing is planned', () => {
    const groups = groupBacklog([task('a'), task('b', { flagged: true })], NOW);
    expect(groups.map((g) => [g.horizon, g.tasks.map((t) => t.id)])).toEqual([['unplanned', ['b', 'a']]]);
    expect(hasPlannedGroups(groups)).toBe(false);
  });

  it('returns no groups for no tasks', () => {
    expect(groupBacklog([], NOW)).toEqual([]);
  });
});

describe('formatDateKey', () => {
  it('formats day and short month, with the year when it is another year', () => {
    expect(formatDateKey('2026-11-03', NOW)).toBe('3 Nov');
    expect(formatDateKey('2027-01-04', NOW)).toBe('4 Jan 2027');
    expect(formatDateKey('later', NOW)).toBe('');
  });
});

describe('planning form value', () => {
  it('reads a task with a choice-able week', () => {
    expect(planningFormValue({ plannedFor: '2026-11-02', deadline: '2026-11-20', hardDeadline: true, flagged: true }, NOW)).toEqual({
      when: 'next_week',
      deadline: '2026-11-20',
      hardDeadline: true,
      flagged: true
    });
    expect(planningFormValue(undefined, NOW)).toEqual(EMPTY_PLANNING_FORM);
  });

  it('keeps a past or far week without picking a choice', () => {
    const value = planningFormValue({ plannedFor: '2026-10-19' }, NOW);
    expect(value).toMatchObject({ when: null, plannedFor: '2026-10-19' });
    expect(planningMetadata(value, NOW).plannedFor).toBe('2026-10-19');
  });

  it('saves every field, with undefined for the ones that are cleared', () => {
    expect(planningMetadata({ when: 'this_week', deadline: '2026-11-20', hardDeadline: true, flagged: true }, NOW)).toEqual({
      plannedFor: '2026-10-26',
      deadline: '2026-11-20',
      hardDeadline: true,
      flagged: true
    });
    const cleared = planningMetadata({ ...EMPTY_PLANNING_FORM, hardDeadline: true }, NOW);
    expect(Object.keys(cleared).sort()).toEqual(['deadline', 'flagged', 'hardDeadline', 'plannedFor']);
    expect(Object.values(cleared).every((v) => v === undefined)).toBe(true);
  });
});
