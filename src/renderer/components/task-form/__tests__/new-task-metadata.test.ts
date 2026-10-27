/**
 * A new task's metadata, shared by the task dialog and the board's capture bar: untouched fields
 * give the project's defaults, and the dialog's own choices are stored as before.
 */
import { describe, it, expect } from 'vitest';
import { newTaskMetadata, type NewTaskGitDefaults } from '../new-task-metadata';
import { PROJECT_DEFAULT_BRANCH } from '../TaskGitOptions';

const git: NewTaskGitDefaults = {
  projectDefaultBranch: 'main',
  projectPushNewBranches: false,
  isLocalBranch: (branch) => branch === 'feature/local'
};

describe('newTaskMetadata', () => {
  it('gives untouched fields the project defaults', () => {
    expect(newTaskMetadata({ mcpConnectors: ['context7'] }, git)).toEqual({
      sourceType: 'manual',
      baseBranch: 'main',
      mcpConnectors: ['context7']
    });
  });

  it('leaves the base branch out while the project default is not known yet', () => {
    expect(newTaskMetadata({ mcpConnectors: [] }, { ...git, projectDefaultBranch: '' })).toEqual({
      sourceType: 'manual',
      mcpConnectors: []
    });
  });

  it('stores the dialog choices that differ from the defaults', () => {
    const image = { id: 'img', filename: 'shot.png', mimeType: 'image/png', size: 3, data: 'AAA' };
    expect(
      newTaskMetadata(
        {
          mcpConnectors: [],
          images: [image],
          baseBranch: 'feature/local',
          useWorktree: false,
          pushNewBranches: true,
          planning: { plannedFor: 'later', deadline: '2026-11-20', hardDeadline: undefined, flagged: true }
        },
        git
      )
    ).toEqual({
      sourceType: 'manual',
      attachedImages: [image],
      baseBranch: 'feature/local',
      useWorktree: false,
      useLocalBranch: true,
      pushNewBranches: true,
      mcpConnectors: [],
      plannedFor: 'later',
      deadline: '2026-11-20',
      flagged: true
    });
  });

  it('stores what a new task waits on and since when, and leaves cleared fields out', () => {
    const waiting = { waitingOn: 'House Labs reply', waitingSince: '2026-10-28T09:00:00.000Z' };
    expect(newTaskMetadata({ mcpConnectors: [], waiting }, git)).toMatchObject(waiting);

    const notWaiting = newTaskMetadata({ mcpConnectors: [], waiting: { waitingOn: undefined, waitingSince: undefined } }, git);
    expect(notWaiting).not.toHaveProperty('waitingOn');
    expect(notWaiting).not.toHaveProperty('waitingSince');
  });

  it('keeps the project default when the project default branch is picked explicitly', () => {
    const metadata = newTaskMetadata({ mcpConnectors: [], baseBranch: PROJECT_DEFAULT_BRANCH, pushNewBranches: false }, git);
    expect(metadata).not.toHaveProperty('useLocalBranch');
    expect(metadata).not.toHaveProperty('pushNewBranches');
    expect(metadata.baseBranch).toBe('main');
  });

  it('marks only a local branch as local', () => {
    expect(newTaskMetadata({ mcpConnectors: [], baseBranch: 'origin/release' }, git)).not.toHaveProperty('useLocalBranch');
  });
});
