/**
 * @vitest-environment jsdom
 */

/**
 * The fields TASK_UPDATE writes itself (the task's activity and slipped weeks) are taken from
 * the saved task into the store after every optimistic metadata save, so the task's timeline
 * shows a tick or a move straight away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FocusSession, Task, TaskActivity, TaskMetadata } from '../../../shared/types';
import type { ClaudeRunInfo } from '../../../shared/types/claude-code';

const mockUpdateTask = vi.fn();

const AT = '2026-10-28T09:00:00.000Z';
const earlier: TaskActivity = { at: '2026-10-27T09:00:00.000Z', kind: 'flagged' };

function task(metadata: TaskMetadata = {}): Task {
  return {
    id: 'task-1',
    specId: 'task-1',
    projectId: 'project-1',
    title: 'Task',
    description: '',
    status: 'human_review',
    subtasks: [],
    logs: [],
    metadata: { sourceType: 'manual', activity: [earlier], ...metadata },
    claudeRun: { validation: { yourSteps: ['Send the email'] } } as unknown as ClaudeRunInfo,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/** TASK_UPDATE's result: the update merged in, with the activity main recorded */
function savedWith(activity: TaskActivity[], extra: TaskMetadata = {}) {
  return async (_taskId: string, updates: { metadata?: TaskMetadata }) => ({
    success: true,
    data: { ...task(), metadata: { ...task().metadata, ...updates.metadata, ...extra, activity: [earlier, ...activity] } }
  });
}

describe('metadata saves take the activity TASK_UPDATE recorded', () => {
  let store: typeof import('../task-store');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    (window as unknown as { electronAPI: unknown }).electronAPI = { updateTask: mockUpdateTask, getTasks: vi.fn() };
    store = await import('../task-store');
    store.useTaskStore.setState({ tasks: [task()] });
  });

  const metadata = () => store.useTaskStore.getState().tasks[0].metadata;

  it('a planning change from the card menu, with the weeks it slipped from', async () => {
    const planned: TaskActivity = { at: AT, kind: 'planned', value: '2026-11-02' };
    mockUpdateTask.mockImplementation(savedWith([planned], { slippedWeeks: ['2026-10-26'] }));

    expect(await store.setTaskPlanning('task-1', { plannedFor: '2026-11-02' })).toBe(true);
    expect(metadata()).toMatchObject({ plannedFor: '2026-11-02', slippedWeeks: ['2026-10-26'], activity: [earlier, planned] });
  });

  it('waiting on someone', async () => {
    const waiting: TaskActivity = { at: AT, kind: 'waiting', value: 'Sam' };
    mockUpdateTask.mockImplementation(savedWith([waiting]));

    expect(await store.setTaskWaiting('task-1', 'Sam')).toBe(true);
    expect(metadata()?.waitingOn).toBe('Sam');
    expect(metadata()?.activity).toEqual([earlier, waiting]);
  });

  it('a ticked step', async () => {
    const done: TaskActivity = { at: AT, kind: 'step_done', value: 'Send the email' };
    mockUpdateTask.mockImplementation(savedWith([done]));

    expect(await store.setYourStepDone('task-1', 'Send the email', true)).toBe(true);
    expect(metadata()).toMatchObject({ yourStepsDone: ['Send the email'], activity: [earlier, done] });
  });

  it('a logged focus session (main records no activity for it, so the store keeps its own)', async () => {
    const session: FocusSession = {
      startedAt: AT,
      endedAt: '2026-10-28T09:25:00.000Z',
      focusedSeconds: 1500,
      plannedMinutes: 25,
      outcome: 'progress'
    };
    mockUpdateTask.mockImplementation(savedWith([]));

    expect(await store.logFocusSession('task-1', 'project-1', session)).toBe(true);
    expect(metadata()).toMatchObject({ focusSessions: [session], activity: [earlier] });
  });

  it("leaves the store's fields alone when the result has none (an older main process, or no data)", async () => {
    mockUpdateTask.mockResolvedValue({ success: true });

    expect(await store.setTaskPlanning('task-1', { flagged: true })).toBe(true);
    expect(metadata()).toMatchObject({ flagged: true, activity: [earlier] });
  });

  it('keeps later changes the store made while saving', async () => {
    const flagged: TaskActivity = { at: AT, kind: 'flagged' };
    let resolveSave: (value: unknown) => void = () => {};
    mockUpdateTask.mockImplementation(
      (taskId: string, updates: { metadata?: TaskMetadata }) =>
        new Promise((resolve) => {
          resolveSave = () => resolve(savedWith([flagged])(taskId, updates));
        })
    );

    const saving = store.setTaskPlanning('task-1', { flagged: true });
    // A field changed in the store before the save comes back
    const current = store.useTaskStore.getState().tasks[0];
    store.useTaskStore.getState().updateTask('task-1', { metadata: { ...current.metadata, waitingOn: 'Sam' } });
    resolveSave(undefined);

    expect(await saving).toBe(true);
    expect(metadata()).toMatchObject({ flagged: true, waitingOn: 'Sam', activity: [earlier, flagged] });
  });
});
