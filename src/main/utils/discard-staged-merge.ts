/**
 * Undoing a stage-only merge
 * ==========================
 *
 * A stage-only merge leaves a task's changes staged in the user's main checkout. When the user
 * requests changes instead, only the paths the index holds are taken back out: modified and
 * deleted files are restored from HEAD and added files are removed. Everything else in the
 * checkout (untracked files, edits to other files since the merge) is left alone.
 */

import { rm, rmdir } from 'fs/promises';
import path from 'path';
import { git } from './git-exec';
import { isPathWithinBase } from '../worktree-paths';

/** Paths per git call, keeping each command line well under Windows' limit */
const PATH_BATCH = 100;

/** Workbench's own data stays, as a merge never stages it on purpose */
const DATA_DIR = '.workbench';

export async function discardStagedMerge(projectPath: string): Promise<void> {
  const options = { cwd: projectPath, isolated: true };
  const fields = (await git(['diff', '--cached', '--name-status', '--no-renames', '-z'], options)).stdout.split('\0');
  const added: string[] = [];
  const changed: string[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [status, file] = [fields[i], fields[i + 1]];
    if (file) (status === 'A' ? added : changed).push(file);
  }
  if (added.length + changed.length === 0) return;

  await git(['reset', '-q', 'HEAD'], options);
  for (let i = 0; i < changed.length; i += PATH_BATCH) {
    await git(['checkout', '--', ...changed.slice(i, i + PATH_BATCH)], options);
  }

  const root = path.resolve(projectPath);
  for (const file of added) {
    const target = path.resolve(root, file);
    if (file === DATA_DIR || file.startsWith(`${DATA_DIR}/`) || !isPathWithinBase(target, root)) continue;
    await rm(target, { force: true });
    // Folders the merge created are removed once empty; rmdir fails on the first one that isn't
    for (let dir = path.dirname(target); dir !== root && isPathWithinBase(dir, root); dir = path.dirname(dir)) {
      if (!(await rmdir(dir).then(() => true, () => false))) break;
    }
  }
}
