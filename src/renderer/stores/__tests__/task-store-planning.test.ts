/**
 * @vitest-environment jsdom
 */

/**
 * The card menu's planning changes: shown in the store right away, saved through TASK_UPDATE
 * (an undefined field clears it), and undone when saving fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '../../../shared/types';

const mockUpdateTask = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    updateTask: mockUpdateTask
  }
});

function task(): Task {
  return {
    id: 'task-1',
    specId: 'task-1',
    projectId: 'project-1',
    title: 'Task',
    description: '',
    status: 'backlog',
    subtasks: [],
    logs: [],
    metadata: { sourceType: 'manual', plannedFor: '2026-10-26', flagged: true },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('setTaskPlanning', () => {
  let store: typeof import('../task-store');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    store = await import('../task-store');
    store.useTaskStore.setState({ tasks: [task()] });
  });

  const metadata = () => store.useTaskStore.getState().tasks[0].metadata;

  it('changes the store and saves the change, clearing a field with undefined', async () => {
    mockUpdateTask.mockResolvedValue({ success: true });

    const saved = await store.setTaskPlanning('task-1', { plannedFor: 'later', flagged: undefined });

    expect(saved).toBe(true);
    expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { metadata: { plannedFor: 'later', flagged: undefined } });
    expect(metadata()).toMatchObject({ sourceType: 'manual', plannedFor: 'later' });
    expect(metadata()?.flagged).toBeUndefined();
  });

  it('undoes the change when saving fails', async () => {
    mockUpdateTask.mockResolvedValue({ success: false, error: 'Spec directory not found' });

    const saved = await store.setTaskPlanning('task-1', { plannedFor: undefined });

    expect(saved).toBe(false);
    expect(metadata()).toMatchObject({ plannedFor: '2026-10-26', flagged: true });
  });

  it('undoes the change when the IPC call throws', async () => {
    mockUpdateTask.mockRejectedValue(new Error('IPC unavailable'));

    expect(await store.setTaskPlanning('task-1', { flagged: undefined })).toBe(false);
    expect(metadata()?.flagged).toBe(true);
  });
});
