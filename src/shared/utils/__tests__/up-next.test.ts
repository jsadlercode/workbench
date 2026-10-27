import { describe, it, expect } from 'vitest';
import { suggestUpNext, UP_NEXT_SCORES, type UpNextReason } from '../up-next';
import type { TaskMetadata, TaskStatus } from '../../types/task';

// Local dates: Wednesday 28 Oct 2026 (this week runs Mon 26 Oct to Sun 1 Nov)
const NOW = new Date(2026, 9, 28, 15, 30);
const THIS_WEEK = '2026-10-26';
const NEXT_WEEK = '2026-11-02';
const LAST_WEEK = '2026-10-19';

function task(id: string, metadata: TaskMetadata = {}, status: TaskStatus = 'backlog') {
  return { id, status, metadata };
}

/** The one suggestion for a single task, or undefined when it isn't suggested */
function only(metadata: TaskMetadata) {
  const [suggestion] = suggestUpNext([task('a', metadata)], NOW);
  return suggestion;
}

function reasons(metadata: TaskMetadata): UpNextReason[] | undefined {
  return only(metadata)?.reasons;
}

describe('suggestUpNext rules', () => {
  it('scores a carried-over task', () => {
    expect(only({ plannedFor: LAST_WEEK })).toMatchObject({
      score: UP_NEXT_SCORES.carriedOver,
      reasons: [{ key: 'carried_over', tone: 'soon' }]
    });
    expect(UP_NEXT_SCORES.carriedOver).toBe(50);
  });

  it('scores an overdue hard deadline as urgent and a past target date as soon', () => {
    expect(only({ deadline: '2026-10-27', hardDeadline: true })).toMatchObject({
      score: 60,
      reasons: [{ key: 'overdue', tone: 'urgent' }]
    });
    expect(only({ deadline: '2026-10-27' })).toMatchObject({
      score: 25,
      reasons: [{ key: 'past_target', tone: 'soon' }]
    });
  });

  it('scores a deadline 7 days or less away, urgent when hard and soon for a target', () => {
    expect(only({ deadline: '2026-11-04', hardDeadline: true })).toMatchObject({
      score: 45,
      reasons: [{ key: 'due_in_days', tone: 'urgent', days: 7 }]
    });
    expect(only({ deadline: '2026-11-04' })).toMatchObject({
      score: 18,
      reasons: [{ key: 'due_in_days', tone: 'soon', days: 7 }]
    });
  });

  it('says due today on the day', () => {
    expect(reasons({ deadline: '2026-10-28', hardDeadline: true })).toEqual([{ key: 'due_today', tone: 'urgent' }]);
    expect(reasons({ deadline: '2026-10-28' })).toEqual([{ key: 'due_today', tone: 'soon' }]);
  });

  it('scores a hard deadline 8 to 21 days away as soon, and only once', () => {
    expect(only({ deadline: '2026-11-05', hardDeadline: true })).toMatchObject({
      score: 20,
      reasons: [{ key: 'due_in_days', tone: 'soon', days: 8 }]
    });
    expect(only({ deadline: '2026-11-18', hardDeadline: true })).toMatchObject({ score: 20 });
    // Past 21 days, or a target date past 7 days: nothing
    expect(only({ deadline: '2026-11-19', hardDeadline: true })).toBeUndefined();
    expect(only({ deadline: '2026-11-05' })).toBeUndefined();
  });

  it('scores a flagged task in the accent tone', () => {
    expect(only({ flagged: true })).toMatchObject({
      score: 30,
      reasons: [{ key: 'flagged', tone: 'accent' }]
    });
  });

  it('gives this week its reason only when nothing else explains the pick', () => {
    expect(only({ plannedFor: THIS_WEEK })).toMatchObject({
      score: 20,
      reasons: [{ key: 'this_week', tone: 'neutral' }]
    });
    expect(only({ plannedFor: THIS_WEEK, flagged: true })).toMatchObject({
      score: 50,
      reasons: [{ key: 'flagged', tone: 'accent' }]
    });
  });

  it('nudges next week up, naming it only when nothing else applies', () => {
    expect(only({ plannedFor: NEXT_WEEK })).toMatchObject({
      score: 4,
      reasons: [{ key: 'next_week', tone: 'neutral' }]
    });
    expect(only({ plannedFor: NEXT_WEEK, flagged: true })).toMatchObject({
      score: 34,
      reasons: [{ key: 'flagged', tone: 'accent' }]
    });
  });

  it('adds the rules up, reasons in rule order', () => {
    expect(only({ plannedFor: LAST_WEEK, deadline: '2026-10-30', hardDeadline: true, flagged: true })).toMatchObject({
      score: 50 + 45 + 30,
      reasons: [
        { key: 'carried_over', tone: 'soon' },
        { key: 'due_in_days', tone: 'urgent', days: 2 },
        { key: 'flagged', tone: 'accent' }
      ]
    });
  });
});

describe('suggestUpNext waiting', () => {
  const WAITING: TaskMetadata = { waitingOn: 'House Labs reply', waitingSince: '2026-10-26T09:00:00.000Z' };

  it('subtracts 45 for a waiting task and says so when it still shows', () => {
    expect(UP_NEXT_SCORES.waiting).toBe(-45);
    expect(only({ ...WAITING, plannedFor: LAST_WEEK, flagged: true })).toMatchObject({
      score: 50 + 30 - 45,
      reasons: [
        { key: 'carried_over', tone: 'soon' },
        { key: 'flagged', tone: 'accent' },
        { key: 'waiting', tone: 'neutral' }
      ]
    });
  });

  it('drops a waiting task with nothing else going for it', () => {
    expect(only({ ...WAITING, flagged: true })).toBeUndefined();
    expect(only({ ...WAITING, plannedFor: THIS_WEEK })).toBeUndefined();
    expect(only(WAITING)).toBeUndefined();
  });

  it('puts a waiting task below one that is not', () => {
    const suggestions = suggestUpNext(
      [
        task('waiting', { ...WAITING, deadline: '2026-10-20', hardDeadline: true }),
        task('flagged', { flagged: true })
      ],
      NOW
    );
    expect(suggestions.map((s) => [s.task.id, s.score])).toEqual([
      ['flagged', 30],
      ['waiting', 15]
    ]);
  });

  it('ignores blank waiting text', () => {
    expect(only({ waitingOn: '   ', flagged: true })).toMatchObject({ score: 30, reasons: [{ key: 'flagged' }] });
  });
});

describe('suggestUpNext selection', () => {
  it('leaves out tasks scoring 0', () => {
    const suggestions = suggestUpNext(
      [
        task('plain'),
        task('later', { plannedFor: 'later' }),
        task('far-target', { deadline: '2026-12-20' }),
        task('flagged', { flagged: true })
      ],
      NOW
    );
    expect(suggestions.map((s) => s.task.id)).toEqual(['flagged']);
  });

  it('leaves out archived tasks and tasks outside the Backlog', () => {
    const suggestions = suggestUpNext(
      [
        task('archived', { flagged: true, archivedAt: '2026-10-20T00:00:00.000Z' }),
        task('queued', { flagged: true }, 'queue'),
        task('running', { flagged: true }, 'in_progress'),
        task('done', { flagged: true }, 'done'),
        task('backlog', { flagged: true })
      ],
      NOW
    );
    expect(suggestions.map((s) => s.task.id)).toEqual(['backlog']);
  });

  it('sorts by score, highest first, and breaks ties with the Backlog order', () => {
    const suggestions = suggestUpNext(
      [
        task('next-week', { plannedFor: NEXT_WEEK }),
        task('flagged-b', { flagged: true }),
        task('overdue', { deadline: '2026-10-01', hardDeadline: true }),
        task('flagged-a', { flagged: true }),
        task('this-week', { plannedFor: THIS_WEEK })
      ],
      NOW
    );
    expect(suggestions.map((s) => [s.task.id, s.score])).toEqual([
      ['overdue', 60],
      ['flagged-b', 30],
      ['flagged-a', 30],
      ['this-week', 20],
      ['next-week', 4]
    ]);
  });

  it('returns nothing for a project that does not plan', () => {
    expect(suggestUpNext([task('a'), task('b')], NOW)).toEqual([]);
  });
});
