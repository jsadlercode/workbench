/**
 * Quick capture's task creation, shared by the board's capture bar and focus mode's "Park a
 * stray thought": a Backlog task from one line of text, with the defaults the task dialog gives
 * when its fields are left as they are (task-form/new-task-metadata.ts). Triage picks model and
 * effort when the task runs.
 */
import { useTranslation } from 'react-i18next';
import { useTaskGitOptions } from '../components/task-form/TaskGitOptions';
import { newTaskMetadata } from '../components/task-form/new-task-metadata';
import { createTask, useTaskStore } from '../stores/task-store';
import { useProjectStore } from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import { getDefaultMcpConnectorIds } from '../../shared/utils/mcp-connectors';

/**
 * Longest capture used as its own title. A short capture already reads like a title, and using it
 * skips the Claude Code call that generates one, which takes seconds per add; a longer one gets a
 * generated title (an empty title asks the create handler for one).
 */
const MAX_TITLE_LENGTH = 80;

export function captureTitle(description: string): string {
  return description.length <= MAX_TITLE_LENGTH ? description : '';
}

/**
 * Adds a Backlog task to the project from a trimmed description; `plannedFor` is its planned
 * week (unset leaves it unplanned). Resolves to why it failed, or null.
 */
export type QuickCapture = (description: string, plannedFor?: string) => Promise<string | null>;

export function useQuickCapture(projectId: string): QuickCapture {
  const { t } = useTranslation(['tasks', 'common']);
  const mcpConnectorSettings = useSettingsStore((state) => state.settings.mcpConnectors);
  // The project's default branch and push setting, as the task dialog reads them
  const gitOptions = useTaskGitOptions(projectId);

  return async (description, plannedFor) => {
    try {
      // The dialog's defaults for fields it leaves as they are
      const metadata = newTaskMetadata(
        { mcpConnectors: getDefaultMcpConnectorIds(mcpConnectorSettings), planning: { plannedFor } },
        gitOptions
      );
      const title = captureTitle(description);

      // The board's store holds the window's project only: a task for another project (a
      // focus session that began before the window moved on) is created without it
      const { activeProjectId, selectedProjectId } = useProjectStore.getState();
      const windowProjectId = activeProjectId ?? selectedProjectId;
      if (windowProjectId && windowProjectId !== projectId) {
        const result = await window.electronAPI.createTask(projectId, title, description, metadata);
        return result.success ? null : result.error || t('tasks:wizard.errors.createFailed');
      }

      const task = await createTask(projectId, title, description, metadata);
      return task ? null : useTaskStore.getState().error || t('tasks:wizard.errors.createFailed');
    } catch (err) {
      return err instanceof Error ? err.message : t('common:errors.unknownError');
    }
  };
}
