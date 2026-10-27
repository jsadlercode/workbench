/**
 * TASK_UPDATE's metadata merge: an update's undefined field removes it from task_metadata.json,
 * so clearing a deadline or a planned week in the dialog or the card menu clears it on disk.
 */
import { describe, it, expect, vi } from 'vitest';
import type { TaskMetadata } from '../../../../shared/types';

vi.mock('../../../project-store', () => ({
  projectStore: { getProjects: () => [], getTasks: () => [] }
}));

import { mergeTaskMetadata } from '../shared';

describe('mergeTaskMetadata', () => {
  const current: TaskMetadata = {
    sourceType: 'manual',
    plannedFor: '2026-10-26',
    deadline: '2026-11-03',
    hardDeadline: true,
    flagged: true
  };

  it('sets the updated fields and keeps the others', () => {
    expect(mergeTaskMetadata(current, { plannedFor: 'later' })).toEqual({ ...current, plannedFor: 'later' });
  });

  it('removes a field the update clears, after the IPC structured clone', () => {
    // ipcRenderer.invoke sends its arguments with the structured clone algorithm
    const updates = structuredClone({ deadline: undefined, hardDeadline: undefined, flagged: undefined });
    const merged = mergeTaskMetadata(current, updates);
    expect(JSON.parse(JSON.stringify(merged))).toEqual({ sourceType: 'manual', plannedFor: '2026-10-26' });
    expect('deadline' in merged).toBe(false);
  });

  it('removes a field sent as null', () => {
    const merged = mergeTaskMetadata(current, { plannedFor: null } as unknown as Partial<TaskMetadata>);
    expect('plannedFor' in merged).toBe(false);
  });

  it('starts from no metadata', () => {
    expect(mergeTaskMetadata(undefined, { flagged: true, deadline: undefined })).toEqual({ flagged: true });
  });
});
