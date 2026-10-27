import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOCUS_LENGTH,
  FOCUS_LENGTHS,
  focusCandidates,
  focusClock,
  focusSummary,
  focusTimeUpAt,
  formatFocusClock,
  isFocusLength,
  isFocusRunning,
  toFocusSession,
  withFocusSession,
  type FocusTimerTimes
} from '../focus';
import type { ClaudeRunInfo } from '../../types/claude-code';
import type { FocusSession, Task, TaskMetadata, TaskStatus } from '../../types/task';

const MIN = 60_000;
const START = Date.UTC(2026, 9, 28, 9, 0);

const timer = (overrides: Partial<FocusTimerTimes> = {}): FocusTimerTimes => ({
  lengthMinutes: 25,
  addedMinutes: 0,
  startedAt: START,
  pausedAt: null,
  pausedMs: 0,
  endedAt: null,
  ...overrides
});

describe('focus lengths', () => {
  it('offers 15 to 60 minutes, 25 by default', () => {
    expect(FOCUS_LENGTHS).toEqual([15, 25, 30, 45, 60]);
    expect(DEFAULT_FOCUS_LENGTH).toBe(25);
    expect(isFocusLength(45)).toBe(true);
    expect(isFocusLength(20)).toBe(false);
    expect(isFocusLength('25')).toBe(false);
  });
});

describe('focusClock', () => {
  it('counts down from the length while running', () => {
    const clock = focusClock(timer(), START + 10 * MIN);
    expect(clock).toEqual({ plannedMs: 25 * MIN, focusedMs: 10 * MIN, remainingMs: 15 * MIN, timeUp: false, progress: 0.4 });
    expect(isFocusRunning(timer())).toBe(true);
  });

  it('stands still while paused and leaves pauses out of the focused time', () => {
    // Paused at 10 minutes, read 7 minutes later
    const paused = timer({ pausedAt: START + 10 * MIN });
    expect(focusClock(paused, START + 17 * MIN)).toMatchObject({ focusedMs: 10 * MIN, remainingMs: 15 * MIN, timeUp: false });
    expect(isFocusRunning(paused)).toBe(false);

    // Resumed after a 7 minute pause: 20 minutes in, 13 of them focused
    const resumed = timer({ pausedMs: 7 * MIN });
    expect(focusClock(resumed, START + 20 * MIN)).toMatchObject({ focusedMs: 13 * MIN, remainingMs: 12 * MIN });
  });

  it('adds the +5s to the length', () => {
    const extended = timer({ addedMinutes: 10 });
    expect(focusClock(extended, START + 30 * MIN)).toMatchObject({
      plannedMs: 35 * MIN,
      focusedMs: 30 * MIN,
      remainingMs: 5 * MIN,
      timeUp: false
    });
  });

  it('is up at the end of the length, and never counts past it', () => {
    expect(focusClock(timer(), START + 25 * MIN)).toMatchObject({ timeUp: true, remainingMs: 0, progress: 1 });
    expect(focusClock(timer(), START + 90 * MIN)).toMatchObject({ timeUp: true, focusedMs: 25 * MIN, remainingMs: 0 });
    expect(focusClock(timer({ pausedMs: 5 * MIN }), START + 29 * MIN).timeUp).toBe(false);
  });

  it('stands still at the end of an ended timer', () => {
    const ended = timer({ endedAt: START + 12 * MIN });
    expect(focusClock(ended, START + 60 * MIN)).toMatchObject({ focusedMs: 12 * MIN, timeUp: false });
    expect(isFocusRunning(ended)).toBe(false);
  });

  it('ignores a clock behind the start', () => {
    expect(focusClock(timer(), START - MIN)).toMatchObject({ focusedMs: 0, remainingMs: 25 * MIN, progress: 0 });
  });
});

describe('focusTimeUpAt', () => {
  it('is the start plus the length, the +5s and the pauses, for a running timer only', () => {
    expect(focusTimeUpAt(timer())).toBe(START + 25 * MIN);
    expect(focusTimeUpAt(timer({ addedMinutes: 5, pausedMs: 2 * MIN }))).toBe(START + 32 * MIN);
    expect(focusTimeUpAt(timer({ pausedAt: START + MIN }))).toBeNull();
    expect(focusTimeUpAt(timer({ endedAt: START + MIN }))).toBeNull();
  });
});

describe('formatFocusClock', () => {
  it('shows minutes and seconds, rounding part seconds up', () => {
    expect(formatFocusClock(25 * MIN)).toBe('25:00');
    expect(formatFocusClock(60 * MIN)).toBe('60:00');
    expect(formatFocusClock(9 * MIN + 5_000)).toBe('09:05');
    expect(formatFocusClock(4_001)).toBe('00:05');
    expect(formatFocusClock(0)).toBe('00:00');
    expect(formatFocusClock(-500)).toBe('00:00');
  });
});

describe('toFocusSession', () => {
  it('logs the start, the end, the focused time without pauses and the planned length', () => {
    const ended = timer({ addedMinutes: 5, pausedMs: 3 * MIN, endedAt: START + 23 * MIN + 400 });
    expect(toFocusSession(ended, 'progress', '  Wrote the intro  ')).toEqual({
      startedAt: '2026-10-28T09:00:00.000Z',
      endedAt: '2026-10-28T09:23:00.400Z',
      focusedSeconds: 20 * 60,
      plannedMinutes: 30,
      outcome: 'progress',
      note: 'Wrote the intro'
    });
  });

  it('leaves out an empty note', () => {
    const session = toFocusSession(timer({ endedAt: START + 25 * MIN }), 'finished', '   ');
    expect(session).not.toHaveProperty('note');
    expect(session.focusedSeconds).toBe(25 * 60);
  });

  it('counts a pause still going at the end as a pause', () => {
    const session = toFocusSession(timer({ pausedAt: START + 10 * MIN, endedAt: START + 15 * MIN }), 'stuck');
    expect(session.focusedSeconds).toBe(10 * 60);
  });
});

const session = (focusedSeconds: number, outcome: FocusSession['outcome'] = 'finished'): FocusSession => ({
  startedAt: '2026-10-28T09:00:00.000Z',
  endedAt: '2026-10-28T09:25:00.000Z',
  focusedSeconds,
  plannedMinutes: 25,
  outcome
});

describe('withFocusSession and focusSummary', () => {
  it('appends a session and sums the focused time', () => {
    const first = session(1500);
    const sessions = withFocusSession({ metadata: { focusSessions: [first] } }, session(900, 'stuck'));
    expect(sessions).toEqual([first, session(900, 'stuck')]);
    expect(focusSummary({ metadata: { focusSessions: sessions } })).toEqual({ count: 2, focusedSeconds: 2400 });
  });

  it('starts a list for a task without sessions', () => {
    expect(withFocusSession({}, session(60))).toEqual([session(60)]);
    expect(focusSummary({})).toEqual({ count: 0, focusedSeconds: 0 });
    expect(focusSummary({ metadata: { focusSessions: 'broken' as unknown as FocusSession[] } })).toEqual({
      count: 0,
      focusedSeconds: 0
    });
  });
});

// Wednesday 28 Oct 2026 (local): this week starts Monday 26 Oct
const NOW = new Date(2026, 9, 28);

function task(id: string, status: TaskStatus, metadata: TaskMetadata = {}, yourSteps?: string[]): Task {
  return {
    id,
    specId: id,
    projectId: 'project-1',
    title: `Task ${id}`,
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    claudeRun: yourSteps
      ? ({
          version: 1,
          phases: [],
          subagents: [],
          totalCostUsd: 0,
          updatedAt: '',
          validation: { status: 'passed', summary: '', checks: [], findings: [], yourSteps }
        } as ClaudeRunInfo)
      : undefined,
    createdAt: NOW,
    updatedAt: NOW
  };
}

const ids = (tasks: Task[]) => tasks.map((candidate) => candidate.id);

describe('focusCandidates', () => {
  it('puts tasks with open steps first, then the rest of Human Review, then Up next', () => {
    const tasks = [
      task('review', 'human_review'),
      task('done-with-steps', 'done', {}, ['Send the email']),
      task('pr', 'pr_created'),
      task('review-with-steps', 'human_review', {}, ['Test on an iPhone']),
      task('flagged', 'backlog', { flagged: true }),
      task('plain', 'backlog'),
      task('running', 'in_progress')
    ];
    const { needsYou, upNext } = focusCandidates(tasks, NOW);
    expect(ids(needsYou)).toEqual(['done-with-steps', 'review-with-steps', 'review', 'pr']);
    expect(ids(upNext)).toEqual(['flagged']);
  });

  it('leaves out ticked-off steps, archived tasks, and Up next tasks already in Needs you', () => {
    const tasks = [
      task('all-ticked', 'done', { yourStepsDone: ['Send the email'] }, ['Send the email']),
      task('archived-review', 'human_review', { archivedAt: '2026-10-20T00:00:00.000Z' }),
      task('archived-steps', 'done', { archivedAt: '2026-10-20T00:00:00.000Z' }, ['Call Sam']),
      task('archived-flagged', 'backlog', { flagged: true, archivedAt: '2026-10-20T00:00:00.000Z' }),
      // A Backlog task with steps left from an earlier run: Needs you, not Up next as well
      task('backlog-steps', 'backlog', { flagged: true }, ['Add the secret']),
      task('due', 'backlog', { deadline: '2026-10-29', hardDeadline: true })
    ];
    const { needsYou, upNext } = focusCandidates(tasks, NOW);
    expect(ids(needsYou)).toEqual(['backlog-steps']);
    expect(ids(upNext)).toEqual(['due']);
  });

  it('is empty when nothing needs the user and nothing is suggested', () => {
    expect(focusCandidates([task('plain', 'backlog'), task('done', 'done')], NOW)).toEqual({ needsYou: [], upNext: [] });
  });
});
