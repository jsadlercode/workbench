/**
 * TASK_UPDATE records the weeks a task's planned week slips from (`slippedWeeks`), for every path
 * that changes it (card menu, dialogs, the weekly review's moves), and `projectId` keeps an update
 * in its project when spec ids repeat. TASK_HISTORY_GET returns the changelog's state entries.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { IPCResult, Project, Task, TaskHistoryEntry, TaskMetadata, TaskStatus } from '../../../../shared/types';
import { IPC_CHANNELS } from '../../../../shared/constants';

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const handlers = new Map<string, Handler>();
vi.mock('../../ipc-registry', () => ({
  handleIpc: (channel: string, handler: Handler) => handlers.set(channel, handler)
}));

const projects: Project[] = [];
const tasksByProject = new Map<string, Task[]>();
vi.mock('../../../project-store', () => ({
  projectStore: {
    getProjects: () => projects,
    getProject: (id: string) => projects.find((p) => p.id === id),
    getTasks: (id: string) => tasksByProject.get(id) ?? [],
    invalidateTasksCache: vi.fn()
  }
}));
vi.mock('electron', () => ({ nativeImage: { createFromPath: vi.fn() }, app: { getPath: () => os.tmpdir() } }));
vi.mock('../../../title-generator', () => ({ titleGenerator: { generateTitle: vi.fn() } }));
vi.mock('../../../agent', () => ({ AgentManager: class {} }));
vi.mock('../../../task-state-manager', () => ({ taskStateManager: { clearAllTasks: vi.fn(), clearTask: vi.fn() } }));
vi.mock('../../../services/task-queue', () => ({ taskQueue: { request: vi.fn() } }));
vi.mock('../../../utils/worktree-cleanup', () => ({ cleanupWorktree: vi.fn() }));
vi.mock('../../../worktree-paths', () => ({ isPathWithinBase: vi.fn(), findTaskWorktree: vi.fn(() => null) }));
vi.mock('../../../utils/git-exec', () => ({ git: vi.fn() }));
vi.mock('../../../app-logger', () => ({ appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { registerTaskCRUDHandlers } from '../crud-handlers';
import { registerTaskHistoryHandlers } from '../history-handlers';

// Wednesday 28 Oct 2026: this week starts Monday 26 Oct
const NOW = new Date(2026, 9, 28, 10, 0);

let tmp: string;

function addProject(id: string): Project {
  const project = {
    id,
    name: id,
    path: path.join(tmp, id),
    autoBuildPath: '.workbench',
    settings: {},
    createdAt: NOW,
    updatedAt: NOW
  } as unknown as Project;
  projects.push(project);
  return project;
}

function addTask(project: Project, specId: string, status: TaskStatus, metadata: TaskMetadata): Task {
  const specDir = path.join(project.path, '.workbench', 'tasks', specId);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(path.join(specDir, 'task_metadata.json'), JSON.stringify(metadata));
  writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({ feature: specId, phases: [] }));
  const task = {
    id: specId,
    specId,
    projectId: project.id,
    title: specId,
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    createdAt: NOW,
    updatedAt: NOW
  } as Task;
  tasksByProject.set(project.id, [...(tasksByProject.get(project.id) ?? []), task]);
  return task;
}

function metadataOnDisk(project: Project, specId: string): TaskMetadata {
  return JSON.parse(readFileSync(path.join(project.path, '.workbench', 'tasks', specId, 'task_metadata.json'), 'utf-8'));
}

const update = (taskId: string, metadata: Partial<TaskMetadata>, projectId?: string) =>
  handlers.get(IPC_CHANNELS.TASK_UPDATE)!({}, taskId, { metadata }, projectId) as Promise<IPCResult<Task>>;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'task-update-slips-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  handlers.clear();
  registerTaskCRUDHandlers({} as never);
  registerTaskHistoryHandlers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  projects.length = 0;
  tasksByProject.clear();
  rmSync(tmp, { recursive: true, force: true });
});

describe('TASK_UPDATE slipped weeks', () => {
  it('records this week when a task moves from this week to next week', async () => {
    const project = addProject('p1');
    addTask(project, '001-a', 'backlog', { plannedFor: '2026-10-26', flagged: true });

    const result = await update('001-a', { plannedFor: '2026-11-02' });

    expect(result.success).toBe(true);
    expect(result.data?.metadata).toMatchObject({ plannedFor: '2026-11-02', slippedWeeks: ['2026-10-26'], flagged: true });
    expect(metadataOnDisk(project, '001-a').slippedWeeks).toEqual(['2026-10-26']);
  });

  it('adds every week a carried over task slipped through to the ones it already has', async () => {
    const project = addProject('p1');
    addTask(project, '001-a', 'error', { plannedFor: '2026-10-12', slippedWeeks: ['2026-10-05'] });

    // Clearing the planned week (sent as undefined) slips through this week
    await update('001-a', { plannedFor: undefined });

    const metadata = metadataOnDisk(project, '001-a');
    expect(metadata.plannedFor).toBeUndefined();
    expect(metadata.slippedWeeks).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('records nothing for a done task, or an update that leaves the planned week alone', async () => {
    const project = addProject('p1');
    addTask(project, '001-done', 'done', { plannedFor: '2026-10-26' });
    addTask(project, '002-flag', 'backlog', { plannedFor: '2026-10-19', slippedWeeks: ['2026-10-12'] });

    await update('001-done', { plannedFor: 'later' });
    await update('002-flag', { flagged: true });

    expect(metadataOnDisk(project, '001-done').slippedWeeks).toBeUndefined();
    expect(metadataOnDisk(project, '002-flag')).toEqual({
      plannedFor: '2026-10-19',
      slippedWeeks: ['2026-10-12'],
      flagged: true,
      activity: [{ at: NOW.toISOString(), kind: 'flagged' }]
    });
  });

  it("updates the task in the project it's given when another project has the same spec id", async () => {
    const first = addProject('p1');
    const second = addProject('p2');
    addTask(first, '001-a', 'backlog', { plannedFor: '2026-10-26' });
    addTask(second, '001-a', 'backlog', { plannedFor: '2026-10-26' });

    await update('001-a', { plannedFor: '2026-11-02' }, 'p2');

    expect(metadataOnDisk(first, '001-a').plannedFor).toBe('2026-10-26');
    expect(metadataOnDisk(second, '001-a')).toEqual({
      plannedFor: '2026-11-02',
      slippedWeeks: ['2026-10-26'],
      activity: [{ at: NOW.toISOString(), kind: 'planned', value: '2026-11-02' }]
    });
  });
});

describe('TASK_HISTORY_GET', () => {
  const history = (projectId: string) =>
    handlers.get(IPC_CHANNELS.TASK_HISTORY_GET)!({}, projectId) as Promise<IPCResult<TaskHistoryEntry[]>>;

  it("returns the changelog's state entries without their files", async () => {
    const project = addProject('p1');
    mkdirSync(path.join(project.path, '.workbench'), { recursive: true });
    const lines = [
      { at: '2026-10-26T09:00:00.000Z', task: '001-a', title: 'A', event: 'state', status: 'in_progress', state: 'coding', branch: 'b', files: [] },
      { at: '2026-10-26T09:05:00.000Z', task: '001-a', event: 'edit', files: ['src/a.ts'] },
      { at: '2026-10-26T10:00:00.000Z', task: '001-a', event: 'state', status: 'done', files: ['src/a.ts'] }
    ];
    writeFileSync(path.join(project.path, '.workbench', 'changelog.jsonl'), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);

    expect(await history('p1')).toEqual({
      success: true,
      data: [
        { at: '2026-10-26T09:00:00.000Z', task: '001-a', title: 'A', status: 'in_progress', state: 'coding', branch: 'b' },
        { at: '2026-10-26T10:00:00.000Z', task: '001-a', status: 'done' }
      ]
    });
  });

  it('is empty without a changelog, and an error for an unknown project', async () => {
    addProject('p1');
    expect(await history('p1')).toEqual({ success: true, data: [] });
    expect((await history('nope')).success).toBe(false);
  });
});
