import { describe, it, expect } from 'vitest';
import { isWaiting, listWaiting, waitingChanges, waitingDays } from '../waiting';
import type { TaskMetadata, TaskStatus } from '../../types/task';

// Local time: Wednesday 28 Oct 2026, afternoon
const NOW = new Date(2026, 9, 28, 15, 30);
const local = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString();

function task(id: string, metadata: TaskMetadata = {}, status: TaskStatus = 'backlog') {
  return { id, status, metadata };
}

describe('isWaiting', () => {
  it('is waiting with non-empty text only', () => {
    expect(isWaiting(task('a', { waitingOn: 'House Labs reply' }))).toBe(true);
    expect(isWaiting(task('a', { waitingOn: '   ' }))).toBe(false);
    expect(isWaiting(task('a', { waitingOn: '' }))).toBe(false);
    expect(isWaiting(task('a'))).toBe(false);
    expect(isWaiting({ metadata: undefined })).toBe(false);
  });
});

describe('waitingDays', () => {
  it('counts calendar days since it started waiting, 0 on the day', () => {
    expect(waitingDays(task('a', { waitingOn: 'Sam', waitingSince: local(28, 8) }), NOW)).toBe(0);
    // Late yesterday is one day, whatever the hour
    expect(waitingDays(task('a', { waitingOn: 'Sam', waitingSince: local(27, 23) }), NOW)).toBe(1);
    expect(waitingDays(task('a', { waitingOn: 'Sam', waitingSince: local(18) }), NOW)).toBe(10);
  });

  it('is null when not waiting or without a real start time', () => {
    expect(waitingDays(task('a', { waitingSince: local(20) }), NOW)).toBeNull();
    expect(waitingDays(task('a', { waitingOn: 'Sam' }), NOW)).toBeNull();
    expect(waitingDays(task('a', { waitingOn: 'Sam', waitingSince: 'soon' }), NOW)).toBeNull();
  });

  it('never goes below 0 for a start time ahead of the clock', () => {
    expect(waitingDays(task('a', { waitingOn: 'Sam', waitingSince: local(30) }), NOW)).toBe(0);
  });
});

describe('waitingChanges', () => {
  it('starts the clock now when a task starts waiting, trimming the text', () => {
    expect(waitingChanges({}, '  House Labs reply ', NOW)).toEqual({
      waitingOn: 'House Labs reply',
      waitingSince: NOW.toISOString()
    });
    expect(waitingChanges(undefined, 'Sam', NOW)).toEqual({ waitingOn: 'Sam', waitingSince: NOW.toISOString() });
    // Blank text before counts as not waiting
    expect(waitingChanges({ waitingOn: ' ', waitingSince: local(20) }, 'Sam', NOW).waitingSince).toBe(NOW.toISOString());
  });

  it('keeps the start time when only the text changes', () => {
    expect(waitingChanges({ waitingOn: 'Sam', waitingSince: local(20) }, 'Sam and Alex', NOW)).toEqual({
      waitingOn: 'Sam and Alex',
      waitingSince: local(20)
    });
  });

  it('fills in a missing or broken start time', () => {
    expect(waitingChanges({ waitingOn: 'Sam' }, 'Sam', NOW).waitingSince).toBe(NOW.toISOString());
    expect(waitingChanges({ waitingOn: 'Sam', waitingSince: 'soon' }, 'Sam', NOW).waitingSince).toBe(NOW.toISOString());
  });

  it('clears both fields when the text is emptied', () => {
    const cleared = { waitingOn: undefined, waitingSince: undefined };
    expect(waitingChanges({ waitingOn: 'Sam', waitingSince: local(20) }, '', NOW)).toEqual(cleared);
    expect(waitingChanges({ waitingOn: 'Sam', waitingSince: local(20) }, '   ', NOW)).toEqual(cleared);
    expect(waitingChanges({ waitingOn: 'Sam', waitingSince: local(20) }, undefined, NOW)).toEqual(cleared);
    // Both keys are there, so saving them removes the fields
    expect(Object.keys(waitingChanges({}, '', NOW))).toEqual(['waitingOn', 'waitingSince']);
  });
});

describe('listWaiting', () => {
  it('lists waiting tasks longest waiting first, those without a start time last', () => {
    const tasks = [
      task('recent', { waitingOn: 'Sam', waitingSince: local(27) }),
      task('no-start', { waitingOn: 'Alex' }, 'human_review'),
      task('oldest', { waitingOn: 'House Labs reply', waitingSince: local(12) }, 'in_progress'),
      task('middle', { waitingOn: 'Review', waitingSince: local(20) }, 'pr_created')
    ];
    expect(listWaiting(tasks).map((t) => t.id)).toEqual(['oldest', 'middle', 'recent', 'no-start']);
  });

  it('leaves out done, archived and not waiting tasks, keeping the order for ties', () => {
    const since = local(20);
    const tasks = [
      task('done', { waitingOn: 'Sam', waitingSince: local(1) }, 'done'),
      task('archived', { waitingOn: 'Sam', waitingSince: local(1), archivedAt: local(25) }),
      task('blank', { waitingOn: ' ', waitingSince: local(1) }),
      task('plain'),
      task('b', { waitingOn: 'Sam', waitingSince: since }),
      task('a', { waitingOn: 'Alex', waitingSince: since }, 'error')
    ];
    expect(listWaiting(tasks).map((t) => t.id)).toEqual(['b', 'a']);
  });
});
