/**
 * Task history: the states a project's tasks entered, read from its task changelog
 * (`.workbench/changelog.jsonl`). The weekly review reads when each task was finished from it.
 */
import { handleIpc } from '../ipc-registry';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, TaskHistoryEntry } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getTaskChangelogPath, readTaskChangelog, type TaskChangelogEntry } from '../../task-changelog';

/** The changelog's state entries, oldest first, without the files each one lists */
function toTaskHistory(entries: readonly TaskChangelogEntry[]): TaskHistoryEntry[] {
  return entries
    .filter((entry) => entry.event === 'state')
    .map(({ at, task, title, status, state, branch }) => {
      const item: TaskHistoryEntry = { at, task };
      if (title !== undefined) item.title = title;
      if (status !== undefined) item.status = status;
      if (state !== undefined) item.state = state;
      if (branch !== undefined) item.branch = branch;
      return item;
    });
}

export function registerTaskHistoryHandlers(): void {
  handleIpc(
    IPC_CHANNELS.TASK_HISTORY_GET,
    async (_, projectId: string): Promise<IPCResult<TaskHistoryEntry[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) return { success: false, error: 'Project not found' };
      // An empty list when the project has no changelog yet (readTaskChangelog never throws)
      const entries = await readTaskChangelog(getTaskChangelogPath(project.path, project.autoBuildPath));
      return { success: true, data: toTaskHistory(entries) };
    }
  );
}
