/**
 * Requesting changes on a task that was merged with "stage only" takes the staged merge back out
 * of the main checkout, and nothing else: the user's own untracked files and later edits stay.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

vi.mock('../../cli-tool-manager', () => ({
  getToolPath: () => 'git',
  getToolPathAsync: async () => 'git'
}));

import { discardStagedMerge } from '../discard-staged-merge';
import { getIsolatedGitEnv } from '../git-isolation';

let tmp: string;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', env: getIsolatedGitEnv() }).trim();

function initRepo(): string {
  const repo = path.join(tmp, 'repo');
  mkdirSync(path.join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(repo, '.gitignore'), '.workbench/\n');
  writeFileSync(path.join(repo, 'README.md'), 'base\n');
  writeFileSync(path.join(repo, 'src', 'a.txt'), 'a\n');
  writeFileSync(path.join(repo, 'src', 'b.txt'), 'b\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'discard-staged-merge-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('discardStagedMerge', () => {
  it("removes only what the merge staged and keeps the user's own files", async () => {
    const repo = initRepo();
    git(repo, 'checkout', '-q', '-b', 'task');
    writeFileSync(path.join(repo, 'README.md'), 'task\n');
    unlinkSync(path.join(repo, 'src', 'a.txt'));
    mkdirSync(path.join(repo, 'added', 'deep'), { recursive: true });
    writeFileSync(path.join(repo, 'added', 'deep', 'c.txt'), 'c\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'task');
    git(repo, 'checkout', '-q', 'main');

    // The user's untracked notes and Workbench data are there before the merge
    writeFileSync(path.join(repo, 'notes.txt'), 'mine\n');
    mkdirSync(path.join(repo, '.workbench'));
    writeFileSync(path.join(repo, '.workbench', 'state.json'), '{}\n');
    git(repo, 'merge', '--squash', 'task');
    // ...and an edit to a file the merge didn't touch comes after it
    writeFileSync(path.join(repo, 'src', 'b.txt'), 'edited\n');

    await discardStagedMerge(repo);

    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('');
    expect(readFileSync(path.join(repo, 'README.md'), 'utf-8')).toBe('base\n');
    expect(readFileSync(path.join(repo, 'src', 'a.txt'), 'utf-8')).toBe('a\n');
    expect(existsSync(path.join(repo, 'added'))).toBe(false);
    expect(readFileSync(path.join(repo, 'notes.txt'), 'utf-8')).toBe('mine\n');
    expect(readFileSync(path.join(repo, 'src', 'b.txt'), 'utf-8')).toBe('edited\n');
    expect(existsSync(path.join(repo, '.workbench', 'state.json'))).toBe(true);
  });

  it('leaves a checkout with nothing staged untouched', async () => {
    const repo = initRepo();
    writeFileSync(path.join(repo, 'notes.txt'), 'mine\n');
    writeFileSync(path.join(repo, 'src', 'b.txt'), 'edited\n');

    await discardStagedMerge(repo);

    expect(readFileSync(path.join(repo, 'notes.txt'), 'utf-8')).toBe('mine\n');
    expect(readFileSync(path.join(repo, 'src', 'b.txt'), 'utf-8')).toBe('edited\n');
  });
});
