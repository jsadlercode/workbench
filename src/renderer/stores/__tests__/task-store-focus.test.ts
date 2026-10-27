/**
 * @vitest-environment jsdom
 */

/**
 * Logging a focus session: appended in the store right away, saved through TASK_UPDATE as the
 * whole list, and taken back out when saving fails. A task the store doesn't have (the window
 * moved to another project) gets the session appended to the sessions on disk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FocusSession, Task } from '../../../shared/types';

const mockUpdateTask = vi.fn();
const mockGetTasks = vi.fn();

const earlier: FocusSession = {
  startedAt: '2026-10-27T09:00:00.000Z',
  endedAt: '2026-10-27T09:25:00.000Z',
  focusedSeconds: 1500,
  plannedMinutes: 25,
  outcome: 'progress'
};

const session: FocusSession = {
  startedAt: '2026-10-28T09:00:00.000Z',
  endedAt: '2026-10-28T09:30:00.000Z',
  focusedSeconds: 1680,
  plannedMinutes: 30,
  outcome: 'finished',
  note: 'Shipped it'
};

function task(projectId = 'project-1'): Task {
  return {
    id: 'task-1',
    specId: 'task-1',
    projectId,
    title: 'Task',
    description: '',
    status: 'human_review',
    subtasks: [],
    logs: [],
    metadata: { sourceType: 'manual', focusSessions: [earlier] },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('logFocusSession', () => {
  let store: typeof import('../task-store');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    (window as unknown as { electronAPI: unknown }).electronAPI = { updateTask: mockUpdateTask, getTasks: mockGetTasks };
    store = await import('../task-store');
    store.useTaskStore.setState({ tasks: [task()] });
  });

  const sessions = () => store.useTaskStore.getState().tasks[0].metadata?.focusSessions;

  it('appends the session in the store and saves the whole list', async () => {
    let finish: (value: unknown) => void = () => {};
    mockUpdateTask.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));

    const logging = store.logFocusSession('task-1', 'project-1', session);
    // Shown before the save comes back
    expect(sessions()).toEqual([earlier, session]);
    finish({ success: true });

    expect(await logging).toBe(true);
    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { metadata: { focusSessions: [earlier, session] } });
    expect(store.useTaskStore.getState().tasks[0].metadata?.sourceType).toBe('manual');
    expect(mockGetTasks).not.toHaveBeenCalled();
  });

  it('takes the session back out when saving fails', async () => {
    mockUpdateTask.mockResolvedValue({ success: false, error: 'Spec directory not found' });

    expect(await store.logFocusSession('task-1', 'project-1', session)).toBe(false);
    expect(sessions()).toEqual([earlier]);
  });

  it('takes the session back out when the IPC call throws', async () => {
    mockUpdateTask.mockRejectedValue(new Error('IPC unavailable'));

    expect(await store.logFocusSession('task-1', 'project-1', session)).toBe(false);
    expect(sessions()).toEqual([earlier]);
  });

  it('appends to the sessions on disk for a task of another project', async () => {
    store.useTaskStore.setState({ tasks: [] });
    mockGetTasks.mockResolvedValue({ success: true, data: [task('project-2')] });
    mockUpdateTask.mockResolvedValue({ success: true });

    expect(await store.logFocusSession('task-1', 'project-2', session)).toBe(true);
    expect(mockGetTasks).toHaveBeenCalledWith('project-2');
    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { metadata: { focusSessions: [earlier, session] } });
    // The window's store is left alone
    expect(store.useTaskStore.getState().tasks).toEqual([]);
  });

  it('fails without saving when the task is gone', async () => {
    store.useTaskStore.setState({ tasks: [] });
    mockGetTasks.mockResolvedValue({ success: true, data: [] });

    expect(await store.logFocusSession('task-1', 'project-2', session)).toBe(false);
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});
