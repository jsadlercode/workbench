/**
 * TASK_UPDATE records what an update changes in the task's activity (`metadata.activity`), for
 * the task's timeline: planning, waiting, ticked steps and a new title, keeping the newest 100,
 * and nothing for an update that changes none of them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { IPCResult, Project, Task, TaskActivity, TaskMetadata, TaskStatus } from '../../../../shared/types';
import type { ClaudeRunInfo } from '../../../../shared/types/claude-code';
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

// Wednesday 28 Oct 2026
const NOW = new Date(2026, 9, 28, 10, 0);
const AT = NOW.toISOString();

let tmp: string;
let project: Project;

function addTask(specId: string, metadata: TaskMetadata, extra: Partial<Task> = {}): Task {
  const specDir = path.join(project.path, '.workbench', 'tasks', specId);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(path.join(specDir, 'task_metadata.json'), JSON.stringify(metadata));
  writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify({ feature: specId, phases: [] }));
  const task = {
    id: specId,
    specId,
    projectId: project.id,
    title: `Title ${specId}`,
    description: '',
    status: 'backlog' as TaskStatus,
    subtasks: [],
    logs: [],
    metadata,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra
  } as Task;
  tasksByProject.set(project.id, [...(tasksByProject.get(project.id) ?? []), task]);
  return task;
}

function metadataOnDisk(specId: string): TaskMetadata {
  return JSON.parse(readFileSync(path.join(project.path, '.workbench', 'tasks', specId, 'task_metadata.json'), 'utf-8'));
}

const update = (taskId: string, updates: { title?: string; description?: string; metadata?: Partial<TaskMetadata> }) =>
  handlers.get(IPC_CHANNELS.TASK_UPDATE)!({}, taskId, updates) as Promise<IPCResult<Task>>;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'task-update-activity-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  handlers.clear();
  registerTaskCRUDHandlers({} as never);
  project = { id: 'p1', name: 'p1', path: path.join(tmp, 'p1'), autoBuildPath: '.workbench', settings: {}, createdAt: NOW, updatedAt: NOW } as unknown as Project;
  projects.push(project);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  projects.length = 0;
  tasksByProject.clear();
  rmSync(tmp, { recursive: true, force: true });
});

describe('TASK_UPDATE activity', () => {
  it('records a planned week, a deadline and a flag, returned with the task and saved on disk', async () => {
    addTask('001-a', { sourceType: 'manual' });

    const result = await update('001-a', {
      metadata: { plannedFor: '2026-11-02', deadline: '2026-11-20', hardDeadline: true, flagged: true }
    });

    const expected: TaskActivity[] = [
      { at: AT, kind: 'planned', value: '2026-11-02' },
      { at: AT, kind: 'deadline', value: '2026-11-20', hard: true },
      { at: AT, kind: 'flagged' }
    ];
    expect(result.data?.metadata?.activity).toEqual(expected);
    expect(metadataOnDisk('001-a').activity).toEqual(expected);
  });

  it('records clearing them (sent as undefined, as the dialogs and the card menu do)', async () => {
    addTask('001-a', { plannedFor: 'later', deadline: '2026-11-20', flagged: true });

    await update('001-a', { metadata: { plannedFor: undefined, deadline: undefined, hardDeadline: undefined, flagged: undefined } });

    expect(metadataOnDisk('001-a').activity).toEqual([
      { at: AT, kind: 'planned' },
      { at: AT, kind: 'deadline' },
      { at: AT, kind: 'unflagged' }
    ]);
  });

  it('records waiting, a new waiting text and stopping', async () => {
    addTask('001-a', {});

    await update('001-a', { metadata: { waitingOn: 'Sam', waitingSince: AT } });
    await update('001-a', { metadata: { waitingOn: 'House Labs reply', waitingSince: AT } });
    await update('001-a', { metadata: { waitingOn: undefined, waitingSince: undefined } });

    expect(metadataOnDisk('001-a').activity).toEqual([
      { at: AT, kind: 'waiting', value: 'Sam' },
      { at: AT, kind: 'waiting', value: 'House Labs reply' },
      { at: AT, kind: 'stopped_waiting' }
    ]);
  });

  it("records ticked and unticked steps, but not a tick dropped because the run doesn't list the step any more", async () => {
    const claudeRun = { validation: { yourSteps: ['Send the email', 'Call Sam'] } } as unknown as ClaudeRunInfo;
    addTask('001-a', { yourStepsDone: ['Old step'] }, { claudeRun });

    await update('001-a', { metadata: { yourStepsDone: ['Send the email'] } });
    await update('001-a', { metadata: { yourStepsDone: [] } });

    expect(metadataOnDisk('001-a').activity).toEqual([
      { at: AT, kind: 'step_done', value: 'Send the email' },
      { at: AT, kind: 'step_reopened', value: 'Send the email' }
    ]);
  });

  it('records a new title, also when the update has no metadata', async () => {
    addTask('001-a', { sourceType: 'manual', prUrl: 'https://example.com/pr/1' });

    const result = await update('001-a', { title: 'Write the report' });

    expect(result.data?.title).toBe('Write the report');
    expect(result.data?.metadata?.activity).toEqual([{ at: AT, kind: 'renamed', value: 'Write the report' }]);
    expect(metadataOnDisk('001-a')).toEqual({
      sourceType: 'manual',
      prUrl: 'https://example.com/pr/1',
      activity: [{ at: AT, kind: 'renamed', value: 'Write the report' }]
    });
  });

  it('records nothing for an update that changes none of them', async () => {
    addTask('001-a', { plannedFor: '2026-10-26', flagged: true, waitingOn: 'Sam', yourStepsDone: ['A'] });

    // The edit dialog sends every planning field, and the same values again
    await update('001-a', {
      title: 'Title 001-a',
      description: 'New description',
      metadata: { plannedFor: '2026-10-26', deadline: undefined, hardDeadline: undefined, flagged: true, yourStepsDone: ['A'], mcpConnectors: ['context7'] }
    });

    const metadata = metadataOnDisk('001-a');
    expect(metadata).not.toHaveProperty('activity');
    expect(metadata).toMatchObject({ userDescription: 'New description', mcpConnectors: ['context7'] });
  });

  it('appends to the activity on disk and keeps the newest 100', async () => {
    const old: TaskActivity[] = Array.from({ length: 100 }, (_, i) => ({
      at: new Date(2026, 9, 1, 9, i).toISOString(),
      kind: 'waiting',
      value: `Person ${i}`
    }));
    // The cached task is older than the file, which already has the activity
    addTask('001-a', { activity: old });
    tasksByProject.get(project.id)![0].metadata = {};

    await update('001-a', { metadata: { flagged: true } });

    const activity = metadataOnDisk('001-a').activity ?? [];
    expect(activity).toHaveLength(100);
    expect(activity[0]).toEqual(old[1]);
    expect(activity[99]).toEqual({ at: AT, kind: 'flagged' });
  });
});
