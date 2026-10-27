/**
 * @vitest-environment jsdom
 */

/**
 * Focus mode's timer: start, pause, resume, +5 min and stop as timestamps; kept in sessionStorage
 * (one timer per window), and a timer whose time ran out while the window was closed comes back
 * ended at its scheduled end. The last length picked is kept in localStorage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { focusClock } from '../../../shared/utils/focus';
import type { FocusTimer } from '../focus-store';

const MIN = 60_000;
const START = Date.UTC(2026, 9, 28, 9, 0);
const TASK = { projectId: 'project-1', taskId: 'task-1', taskTitle: 'Write the intro' };

const stored = () => JSON.parse(sessionStorage.getItem('focus-timer') ?? '{}') as { state?: { timer?: FocusTimer | null; open?: boolean } };

describe('useFocusStore', () => {
  let focus: typeof import('../focus-store');

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    sessionStorage.clear();
    vi.resetModules();
    focus = await import('../focus-store');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const state = () => focus.useFocusStore.getState();

  it('opens the picker on a task, or the timer that already runs', () => {
    state().openFocus('task-2');
    expect(state()).toMatchObject({ open: true, preselectedTaskId: 'task-2', timer: null });
    state().hide();
    expect(state().open).toBe(false);

    state().start(TASK, 25);
    state().hide();
    state().openFocus('task-3');
    expect(state()).toMatchObject({ open: true, preselectedTaskId: null });
    expect(state().timer?.taskId).toBe('task-1');
  });

  it('starts, pauses, resumes, adds 5 minutes and stops', () => {
    state().start(TASK, 25);
    expect(state().timer).toEqual({
      ...TASK,
      lengthMinutes: 25,
      addedMinutes: 0,
      startedAt: START,
      pausedAt: null,
      pausedMs: 0,
      endedAt: null
    });
    expect(state().open).toBe(true);

    // 10 minutes in, a 4 minute pause
    state().pause(START + 10 * MIN);
    state().pause(START + 11 * MIN);
    expect(state().timer?.pausedAt).toBe(START + 10 * MIN);
    state().resume(START + 14 * MIN);
    expect(state().timer).toMatchObject({ pausedAt: null, pausedMs: 4 * MIN });

    state().extend();
    expect(state().timer?.addedMinutes).toBe(5);

    // Stopped while paused: the pause counts as a pause
    state().pause(START + 20 * MIN);
    state().hide();
    state().stop(START + 22 * MIN);
    const timer = state().timer!;
    expect(timer).toMatchObject({ pausedAt: null, pausedMs: 6 * MIN, endedAt: START + 22 * MIN });
    expect(focusClock(timer, START + 60 * MIN).focusedMs).toBe(16 * MIN);
    // "How did that go?" shows
    expect(state().open).toBe(true);

    // An ended timer doesn't change any more
    state().extend();
    state().resume(START + 30 * MIN);
    expect(state().timer).toBe(timer);
  });

  it('ends at the scheduled end when time runs out, not before', () => {
    state().start(TASK, 15);
    state().hide();
    state().timeUp(START + 14 * MIN);
    expect(state().timer?.endedAt).toBeNull();

    state().timeUp(START + 15 * MIN + 800);
    expect(state().timer?.endedAt).toBe(START + 15 * MIN);
    expect(state().open).toBe(true);
  });

  it('ends a timer stopped after its time ran out at the scheduled end', () => {
    state().start(TASK, 15);
    state().stop(START + 40 * MIN);
    expect(state().timer?.endedAt).toBe(START + 15 * MIN);
  });

  it('clears the timer and the note, back to the picker', () => {
    state().start(TASK, 25);
    state().stop(START + MIN);
    state().setNote('Got the outline down');
    state().clear('task-1');
    expect(state()).toMatchObject({ timer: null, note: '', preselectedTaskId: 'task-1', open: true });
  });

  it('keeps the timer, the overlay and the note in sessionStorage, not localStorage', () => {
    state().start(TASK, 30);
    state().setNote('Half way');
    expect(stored().state).toMatchObject({ timer: { ...TASK, lengthMinutes: 30 }, open: true });
    expect(localStorage.getItem('focus-timer')).toBeNull();
  });

  it('restores a running timer after a reload', async () => {
    state().start(TASK, 25);
    state().pause(START + 5 * MIN);
    vi.setSystemTime(START + 6 * MIN);

    vi.resetModules();
    const reloaded = await import('../focus-store');
    expect(reloaded.useFocusStore.getState().timer).toMatchObject({ ...TASK, pausedAt: START + 5 * MIN, endedAt: null });
    expect(reloaded.useFocusStore.getState().open).toBe(true);
  });

  it('restores a timer whose time ran out while the window was closed as ended at its scheduled end', async () => {
    state().start(TASK, 25);
    state().hide();
    // Opened again an hour later
    vi.setSystemTime(START + 60 * MIN);
    await focus.useFocusStore.persist.rehydrate();

    expect(state().timer).toMatchObject({ ...TASK, endedAt: START + 25 * MIN });
    expect(state().open).toBe(true);
  });

  it('drops a stored timer it cannot read', async () => {
    sessionStorage.setItem('focus-timer', JSON.stringify({ state: { timer: { taskId: 'task-1' }, open: true }, version: 0 }));
    await focus.useFocusStore.persist.rehydrate();
    expect(state()).toMatchObject({ timer: null, open: false });
  });
});

describe('useFocusLengthStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers the last length in localStorage and ignores one the picker does not offer', async () => {
    vi.resetModules();
    const { useFocusLengthStore } = await import('../focus-store');
    expect(useFocusLengthStore.getState().length).toBe(25);

    useFocusLengthStore.getState().setLength(45);
    expect(JSON.parse(localStorage.getItem('focus-length') ?? '{}')).toMatchObject({ state: { length: 45 } });

    localStorage.setItem('focus-length', JSON.stringify({ state: { length: 20 }, version: 0 }));
    useFocusLengthStore.setState({ length: 25 });
    await useFocusLengthStore.persist.rehydrate();
    expect(useFocusLengthStore.getState().length).toBe(25);

    localStorage.setItem('focus-length', JSON.stringify({ state: { length: 60 }, version: 0 }));
    await useFocusLengthStore.persist.rehydrate();
    expect(useFocusLengthStore.getState().length).toBe(60);
  });
});
