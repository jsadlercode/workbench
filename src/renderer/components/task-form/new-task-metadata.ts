/**
 * The metadata of a new task, shared by the task creation dialog and the board's capture bar, so
 * a captured task gets the defaults a dialog-made one gets when its fields are left as they are.
 */
import type { ImageAttachment, TaskMetadata } from '../../../shared/types';
import type { PlanningMetadataUpdate } from '../../../shared/utils/task-planning';
import { PROJECT_DEFAULT_BRANCH, type TaskGitOptions } from './TaskGitOptions';

export interface NewTaskFields {
  /** Our MCP connector ids (the Connectors defaults unless the user changed them) */
  mcpConnectors: string[];
  images?: ImageAttachment[];
  /** The picked base branch; PROJECT_DEFAULT_BRANCH (the default) stands for the project's default branch */
  baseBranch?: string;
  /** false runs the task without a worktree (default true) */
  useWorktree?: boolean;
  /** Whether the task's new branch is pushed (default: the project's setting) */
  pushNewBranches?: boolean;
  /** Planning fields; undefined ones are left out */
  planning?: Partial<PlanningMetadataUpdate>;
}

/** The project's git defaults a new task's metadata depends on (from `useTaskGitOptions`) */
export type NewTaskGitDefaults = Pick<TaskGitOptions, 'projectDefaultBranch' | 'projectPushNewBranches' | 'isLocalBranch'>;

/** A new task's metadata from the creation fields and the project's git defaults */
export function newTaskMetadata(fields: NewTaskFields, git: NewTaskGitDefaults): TaskMetadata {
  const {
    mcpConnectors,
    images = [],
    baseBranch = PROJECT_DEFAULT_BRANCH,
    useWorktree = true,
    pushNewBranches = git.projectPushNewBranches,
    planning = {}
  } = fields;

  const metadata: TaskMetadata = { sourceType: 'manual' };
  if (images.length > 0) metadata.attachedImages = images;
  // Always include baseBranch - resolve PROJECT_DEFAULT_BRANCH to the actual branch name
  // This ensures the backend always knows which branch to use for worktree creation
  if (baseBranch === PROJECT_DEFAULT_BRANCH) {
    if (git.projectDefaultBranch) metadata.baseBranch = git.projectDefaultBranch;
  } else if (baseBranch) {
    metadata.baseBranch = baseBranch;
  }
  // Pass worktree preference - false means use --direct mode
  if (!useWorktree) metadata.useWorktree = false;
  // Set useLocalBranch when user explicitly selects a local branch
  // This preserves gitignored files (.env, configs) by not switching to origin
  if (baseBranch !== PROJECT_DEFAULT_BRANCH && git.isLocalBranch(baseBranch)) metadata.useLocalBranch = true;
  if (pushNewBranches !== git.projectPushNewBranches) metadata.pushNewBranches = pushNewBranches;
  metadata.mcpConnectors = mcpConnectors;
  // Only the planning fields that are set
  for (const [key, value] of Object.entries(planning)) {
    if (value !== undefined) Object.assign(metadata, { [key]: value });
  }
  return metadata;
}
