/**
 * Reading the project's self-improve switch, for the callers that hold a path rather than a Project
 * (terminals, worktree creation). The switch is kept in the app's own project list, never in the
 * project's checkout: a cloned repo must not be able to turn it on and have its committed memories
 * loaded into sessions as if they were the user's preferences.
 */

import path from 'path';

/** Whether the project learns from its sessions (its "Self-improve" switch; off unless set) */
export function isSelfImproveEnabled(settings: { selfImprove?: boolean } | undefined): boolean {
  return settings?.selfImprove === true;
}

/** Whether the app's project at this path learns from its sessions; false for an unknown path */
export async function isSelfImproveEnabledForPath(projectPath: string | undefined): Promise<boolean> {
  if (!projectPath) return false;
  // Imported here rather than at the top: the project store reaches electron, which worktree
  // creation keeps out of its imports
  const { projectStore } = await import('../project-store');
  const resolved = path.resolve(projectPath);
  const project = projectStore.getProjects().find((p) => path.resolve(p.path) === resolved);
  return isSelfImproveEnabled(project?.settings);
}
