import type { Task, Project, TaskMetadata } from '../../../shared/types';
import { projectStore } from '../../project-store';

/**
 * Helper function to find task and project by taskId.
 *
 * When projectId is provided, the search is strictly scoped to that project.
 * If the task is not found in the specified project, returns undefined (does NOT
 * fall back to other projects). This prevents cross-project contamination when
 * multiple projects have tasks with the same specId.
 *
 * When projectId is NOT provided, searches all projects for backward
 * compatibility with callers that don't have projectId (e.g., file watcher events).
 */
export const findTaskAndProject = (taskId: string, projectId?: string): { task: Task | undefined; project: Project | undefined } => {
  const projects = projectStore.getProjects();

  // If projectId provided, search ONLY that project (no fallback)
  if (projectId) {
    const targetProject = projects.find((p) => p.id === projectId);
    if (!targetProject) {
      console.warn(`[findTaskAndProject] projectId "${projectId}" not found in projects list, returning undefined`);
      return { task: undefined, project: undefined };
    }
    const tasks = projectStore.getTasks(targetProject.id);
    const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    return { task, project: task ? targetProject : undefined };
  }

  // No projectId: search all projects (backward compatibility for file watcher etc.)
  for (const p of projects) {
    const tasks = projectStore.getTasks(p.id);
    const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      return { task, project: p };
    }
  }

  return { task: undefined, project: undefined };
};

/**
 * A task's metadata after an update: the update's fields over the current ones, and a field the
 * update sets to undefined (or null) removed. IPC keeps an undefined field, so this is how the
 * dialogs and the card menu clear a field (a deadline, a planned week) in task_metadata.json.
 */
export function mergeTaskMetadata(current: TaskMetadata | undefined, updates: Partial<TaskMetadata>): TaskMetadata {
  const merged: Record<string, unknown> = { ...current, ...updates };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) delete merged[key];
  }
  return merged as TaskMetadata;
}
