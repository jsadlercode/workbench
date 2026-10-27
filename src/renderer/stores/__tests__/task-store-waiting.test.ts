/**
 * @vitest-environment jsdom
 */

/**
 * Waiting on from the card and the board's Waiting on bar: shown in the store right away, saved
 * through TASK_UPDATE with its start time (undefined fields clear it), and undone when saving fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task, TaskMetadata } from '../../../shared/types';

const mockUpdateTask = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    updateTask: mockUpdateTask
  }
});

const NOW = new Date(2026, 9, 28, 10, 0);
const SINCE = '2026-10-20T09:00:00.000Z';

function task(metadata: TaskMetadata): Task {
  return {
    id: 'task-1',
    specId: 'task-1',
    projectId: 'project-1',
    title: 'Task',
    description: '',
    status: 'human_review',
    subtasks: [],
    logs: [],
    metadata: { sourceType: 'manual', ...metadata },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('setTaskWaiting', () => {
  let store: typeof import('../task-store');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.resetModules();
    store = await import('../task-store');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const metadata = () => store.useTaskStore.getState().tasks[0].metadata;

  it('starts waiting now, trimmed, in the store and on disk', async () => {
    store.useTaskStore.setState({ tasks: [task({})] });
    mockUpdateTask.mockResolvedValue({ success: true });

    expect(await store.setTaskWaiting('task-1', ' House Labs reply ')).toBe(true);

    const changes = { waitingOn: 'House Labs reply', waitingSince: NOW.toISOString() };
    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { metadata: changes });
    expect(metadata()).toMatchObject({ sourceType: 'manual', ...changes });
  });

  it('keeps the start time when only the text changes', async () => {
    store.useTaskStore.setState({ tasks: [task({ waitingOn: 'Sam', waitingSince: SINCE })] });
    mockUpdateTask.mockResolvedValue({ success: true });

    await store.setTaskWaiting('task-1', 'Sam and Alex');

    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', {
      metadata: { waitingOn: 'Sam and Alex', waitingSince: SINCE }
    });
  });

  it('stops waiting with empty text, clearing both fields', async () => {
    store.useTaskStore.setState({ tasks: [task({ waitingOn: 'Sam', waitingSince: SINCE })] });
    mockUpdateTask.mockResolvedValue({ success: true });

    expect(await store.setTaskWaiting('task-1', '')).toBe(true);

    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', {
      metadata: { waitingOn: undefined, waitingSince: undefined }
    });
    expect(metadata()?.waitingOn).toBeUndefined();
    expect(metadata()?.waitingSince).toBeUndefined();
  });

  it('undoes the change when saving fails', async () => {
    store.useTaskStore.setState({ tasks: [task({ waitingOn: 'Sam', waitingSince: SINCE })] });
    mockUpdateTask.mockResolvedValue({ success: false, error: 'Spec directory not found' });

    expect(await store.setTaskWaiting('task-1', '')).toBe(false);
    expect(metadata()).toMatchObject({ waitingOn: 'Sam', waitingSince: SINCE });
  });

  it('undoes the change when the IPC call throws', async () => {
    store.useTaskStore.setState({ tasks: [task({})] });
    mockUpdateTask.mockRejectedValue(new Error('IPC unavailable'));

    expect(await store.setTaskWaiting('task-1', 'Sam')).toBe(false);
    expect(metadata()?.waitingOn).toBeUndefined();
    expect(metadata()?.waitingSince).toBeUndefined();
  });

  it('does nothing for a task it does not know', async () => {
    store.useTaskStore.setState({ tasks: [] });
    expect(await store.setTaskWaiting('missing', 'Sam')).toBe(false);
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});
