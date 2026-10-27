/**
 * The states each project's tasks entered (the project's task changelog, TASK_HISTORY_GET), for
 * the timeline in a task's details. Kept per project: loaded the first time a task of the project
 * is opened, and again only when an opened task's status is not the one it had at the last load
 * (a status change adds a state entry), so opening a task doesn't fetch every time.
 */
import { create } from 'zustand';
import type { TaskHistoryEntry, TaskStatus } from '../../shared/types';
import { useTaskStore } from './task-store';

export interface ProjectTaskHistory {
  /** 'loading' only for the first load; a reload keeps the entries it has meanwhile */
  status: 'loading' | 'ready' | 'failed';
  /** The project's state entries, oldest first */
  entries: TaskHistoryEntry[];
  /** Each task's status when the load began (from the board's store) */
  statuses: Record<string, TaskStatus>;
}

interface TaskHistoryState {
  byProject: Record<string, ProjectTaskHistory>;
  /**
   * Load the project's history unless it was loaded while the task had this status (a failed
   * load is tried again)
   */
  ensure: (projectId: string, taskId: string, status: TaskStatus) => Promise<void>;
  /** Load the project's history (a load under way is waited for) */
  load: (projectId: string) => Promise<void>;
}

const loads = new Map<string, Promise<void>>();

export const useTaskHistoryStore = create<TaskHistoryState>((set, get) => ({
  byProject: {},

  ensure: (projectId, taskId, status) => {
    const cached = get().byProject[projectId];
    if (cached && cached.status !== 'failed' && cached.statuses[taskId] === status) return Promise.resolve();
    // Opened again while the first load runs
    if (cached?.status === 'loading') return loads.get(projectId) ?? Promise.resolve();
    return get().load(projectId);
  },

  load: (projectId) => {
    const running = loads.get(projectId);
    if (running) return running;
    const statuses = Object.fromEntries(
      useTaskStore
        .getState()
        .tasks.filter((task) => task.projectId === projectId)
        .map((task) => [task.id, task.status])
    );
    const previous = get().byProject[projectId];
    if (!previous) set((state) => ({ byProject: { ...state.byProject, [projectId]: { status: 'loading', entries: [], statuses } } }));

    const load = (async () => {
      let next: ProjectTaskHistory;
      try {
        const result = await window.electronAPI.getTaskHistory(projectId);
        next = result.success
          ? { status: 'ready', entries: result.data ?? [], statuses }
          : { status: 'failed', entries: previous?.entries ?? [], statuses };
      } catch {
        next = { status: 'failed', entries: previous?.entries ?? [], statuses };
      }
      set((state) => ({ byProject: { ...state.byProject, [projectId]: next } }));
    })().finally(() => {
      loads.delete(projectId);
    });
    loads.set(projectId, load);
    return load;
  }
}));
