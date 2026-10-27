/**
 * @vitest-environment jsdom
 */
/**
 * Focus mode: start from the picker, pause, +5 min, time running out (chime, "How did that go?"),
 * logging the session on the task (TASK_UPDATE with the appended session), Got stuck opening the
 * task, Don't log, and parking a thought in the Backlog (TASK_CREATE, not planned).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ClaudeRunInfo } from '../../../../shared/types/claude-code';
import type { FocusSession, Project, Task, TaskMetadata, TaskStatus } from '../../../../shared/types';
import { FocusMode } from '../FocusMode';
import { playFocusChime } from '../chime';
import { useFocusLengthStore, useFocusStore } from '../../../stores/focus-store';
import { useProjectStore } from '../../../stores/project-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useTaskStore } from '../../../stores/task-store';

// Return keys (with interpolated values) so assertions don't depend on English copy
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'en' }
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey
}));

vi.mock('../chime', () => ({ playFocusChime: vi.fn() }));

const MIN = 60_000;
// Wednesday 28 Oct 2026, 10:00 local
const NOW = new Date(2026, 9, 28, 10, 0);

const PROJECT: Project = {
  id: 'project-1',
  name: 'Project',
  path: '/repo',
  autoBuildPath: '.workbench',
  settings: { model: 'opus', notifications: { onTaskComplete: true, onTaskFailed: true, onReviewNeeded: true, sound: false }, mainBranch: 'main' },
  createdAt: NOW,
  updatedAt: NOW
};

function task(id: string, status: TaskStatus, metadata: TaskMetadata = {}, yourSteps?: string[]): Task {
  return {
    id,
    specId: id,
    projectId: PROJECT.id,
    title: `Task ${id}`,
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    claudeRun: yourSteps
      ? ({
          version: 1,
          phases: [],
          subagents: [],
          totalCostUsd: 0,
          updatedAt: '',
          validation: { status: 'passed', summary: '', checks: [], findings: [], yourSteps }
        } as ClaudeRunInfo)
      : undefined,
    createdAt: NOW,
    updatedAt: NOW
  };
}

const updateTask = vi.fn();
const createTask = vi.fn();
const onOpenTask = vi.fn();
const wakeLockRequest = vi.fn();
const wakeLockRelease = vi.fn();

function renderFocus() {
  return render(<FocusMode onOpenTask={onOpenTask} />);
}

/** Flush promises (IPC mocks) inside act */
async function settle() {
  await act(async () => {});
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const timerText = () => screen.getByRole('timer').textContent;
const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** Opens the picker and starts focus on the selected task */
async function startFocus(length?: number) {
  act(() => useFocusStore.getState().openFocus());
  renderFocus();
  await settle();
  if (length) fireEvent.click(screen.getByRole('radio', { name: `focus.minutes:${length}` }));
  fireEvent.click(button('focus.picker.start'));
  await settle();
}

describe('FocusMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sessionStorage.clear();
    localStorage.clear();
    useFocusStore.setState({ timer: null, open: false, preselectedTaskId: null, note: '' });
    useFocusLengthStore.setState({ length: 25 });
    useProjectStore.setState({ projects: [PROJECT], selectedProjectId: PROJECT.id, activeProjectId: null });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, mcpConnectors: { context7Enabled: true, electronEnabled: false, puppeteerEnabled: false } }
    }));
    useTaskStore.setState({
      tasks: [
        task('review', 'human_review'),
        task('steps', 'human_review', {}, ['Send the email', 'Call Sam']),
        task('flagged', 'backlog', { flagged: true }),
        task('plain', 'backlog')
      ],
      error: null
    });

    updateTask.mockReset();
    updateTask.mockResolvedValue({ success: true });
    createTask.mockReset();
    createTask.mockImplementation(async (projectId: string, title: string, description: string, metadata: TaskMetadata) => ({
      success: true,
      data: { ...task('parked', 'backlog', metadata), projectId, title, description }
    }));
    onOpenTask.mockReset();
    vi.mocked(playFocusChime).mockReset();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      updateTask,
      createTask,
      getTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getGitBranchesWithInfo: vi.fn().mockResolvedValue({ success: true, data: [] }),
      detectMainBranch: vi.fn().mockResolvedValue({ success: true, data: 'main' })
    };

    wakeLockRelease.mockReset();
    wakeLockRelease.mockResolvedValue(undefined);
    wakeLockRequest.mockReset();
    wakeLockRequest.mockImplementation(async () => {
      const sentinel = { released: false, release: () => { sentinel.released = true; return wakeLockRelease(); } };
      return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request: wakeLockRequest }, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the tasks that need the user, then Up next, with the first one selected', async () => {
    act(() => useFocusStore.getState().openFocus());
    renderFocus();
    await settle();

    const needsYou = screen.getByRole('group', { name: 'focus.picker.needsYou' });
    const upNext = screen.getByRole('group', { name: 'focus.picker.upNext' });
    // Open steps first, then the rest of Human Review
    expect(needsYou.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(needsYou.querySelectorAll('[role="radio"]')[0]).toHaveTextContent('Task steps');
    expect(needsYou.querySelectorAll('[role="radio"]')[0]).toHaveTextContent('focus.picker.stepsLeft:2');
    expect(upNext).toHaveTextContent('Task flagged');
    expect(screen.queryByText('Task plain')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Task steps/ })).toHaveAttribute('aria-checked', 'true');

    // Arrow keys move the selection
    fireEvent.keyDown(screen.getByRole('radio', { name: /Task steps/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: /Task review/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Task review/ })).toHaveFocus();
  });

  it('selects a task picked from its details, also when it is in neither group', async () => {
    act(() => useFocusStore.getState().openFocus('plain'));
    renderFocus();
    await settle();

    expect(screen.getByRole('group', { name: 'focus.picker.selected' })).toHaveTextContent('Task plain');
    expect(screen.getByRole('radio', { name: /Task plain/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('says where focus can start from when no task needs the user', async () => {
    useTaskStore.setState({ tasks: [task('plain', 'backlog')] });
    act(() => useFocusStore.getState().openFocus());
    renderFocus();
    await settle();

    expect(screen.getByText('focus.picker.empty')).toBeInTheDocument();
    expect(screen.getByText('focus.picker.emptyHint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'focus.picker.start' })).not.toBeInTheDocument();
  });

  it('runs the timer: start, pause, +5 min, then time runs out and the session is logged', async () => {
    await startFocus(45);
    expect(useFocusLengthStore.getState().length).toBe(45);
    expect(screen.getByRole('heading', { name: 'Task steps' })).toBeInTheDocument();
    expect(timerText()).toBe('45:00');
    expect(wakeLockRequest).toHaveBeenCalledWith('screen');

    advance(MIN);
    expect(timerText()).toBe('44:00');

    // Paused: the time stands still and the screen may sleep
    fireEvent.click(button('focus.running.pause'));
    await settle();
    expect(screen.getByText('focus.running.paused')).toBeInTheDocument();
    expect(wakeLockRelease).toHaveBeenCalled();
    advance(5 * MIN);
    expect(timerText()).toBe('44:00');

    fireEvent.click(button('focus.running.resume'));
    fireEvent.click(button('focus.running.extendLabel'));
    expect(timerText()).toBe('49:00');
    expect(screen.getByText('focus.running.of:50')).toBeInTheDocument();

    // The task's steps tick off from here
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send the email' }));
    await settle();
    expect(updateTask).toHaveBeenCalledWith('steps', { metadata: { yourStepsDone: ['Send the email'] } });
    updateTask.mockClear();

    advance(49 * MIN);
    expect(playFocusChime).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'focus.ended.title' })).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('focus.ended.notePlaceholder'), { target: { value: 'Drafted the intro' } });
    fireEvent.click(button('focus.ended.progress'));
    await settle();

    const startedAt = NOW.getTime();
    const expected: FocusSession = {
      startedAt: new Date(startedAt).toISOString(),
      // 50 minutes focused, around a 5 minute pause
      endedAt: new Date(startedAt + 55 * MIN).toISOString(),
      focusedSeconds: 50 * 60,
      plannedMinutes: 50,
      outcome: 'progress',
      note: 'Drafted the intro'
    };
    expect(updateTask).toHaveBeenCalledWith('steps', { metadata: { focusSessions: [expected] } });
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'steps')?.metadata?.focusSessions).toEqual([expected]);

    // Back to the picker, on the same task, with a confirmation
    expect(useFocusStore.getState().timer).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('focus.picker.logged');
    expect(screen.getByRole('radio', { name: /Task steps/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps running while hidden, and shows itself again with a chime when time runs out', async () => {
    await startFocus(15);
    fireEvent.click(button('focus.hide'));
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useFocusStore.getState().timer?.endedAt).toBeNull();

    advance(15 * MIN);
    expect(playFocusChime).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'focus.ended.title' })).toBeInTheDocument();
    expect(useFocusStore.getState().timer?.endedAt).toBe(NOW.getTime() + 15 * MIN);
  });

  it('logs Stop and log as Got stuck, then closes and opens the task', async () => {
    await startFocus();
    advance(10 * MIN);
    fireEvent.click(button('focus.running.stop'));
    await settle();
    expect(playFocusChime).not.toHaveBeenCalled();

    fireEvent.click(button('focus.ended.stuck'));
    await settle();

    expect(updateTask).toHaveBeenCalledWith('steps', {
      metadata: { focusSessions: [expect.objectContaining({ focusedSeconds: 600, plannedMinutes: 25, outcome: 'stuck' })] }
    });
    expect(updateTask.mock.calls[0][1].metadata.focusSessions[0]).not.toHaveProperty('note');
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'steps' }));
    expect(useFocusStore.getState()).toMatchObject({ timer: null, open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("drops the session on Don't log", async () => {
    await startFocus();
    fireEvent.click(button('focus.running.stop'));
    await settle();
    fireEvent.click(button('focus.ended.dontLog'));
    await settle();

    expect(updateTask).not.toHaveBeenCalled();
    expect(useFocusStore.getState().timer).toBeNull();
    expect(button('focus.picker.start')).toBeInTheDocument();
  });

  it('says so and stays on "How did that go?" when logging fails', async () => {
    updateTask.mockResolvedValue({ success: false, error: 'Spec directory not found' });
    await startFocus();
    fireEvent.click(button('focus.running.stop'));
    await settle();
    fireEvent.click(button('focus.ended.finished'));
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent('focus.ended.saveFailed');
    expect(screen.getByRole('heading', { name: 'focus.ended.title' })).toBeInTheDocument();
    expect(useFocusStore.getState().timer?.endedAt).not.toBeNull();
    // The session was taken back out of the store
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'steps')?.metadata?.focusSessions).toBeUndefined();
  });

  it('parks a stray thought in the Backlog, not planned, without leaving focus', async () => {
    await startFocus();
    const field = screen.getByPlaceholderText('focus.park.placeholder');
    fireEvent.change(field, { target: { value: '  Rename the config flag  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();

    expect(createTask).toHaveBeenCalledWith(PROJECT.id, 'Rename the config flag', 'Rename the config flag', expect.any(Object));
    const metadata = createTask.mock.calls[0][3] as TaskMetadata;
    expect(metadata).toMatchObject({ sourceType: 'manual', mcpConnectors: ['context7'] });
    expect(metadata).not.toHaveProperty('plannedFor');
    // Its timeline starts with the task being focused on
    expect(metadata.activity).toEqual([{ at: NOW.toISOString(), kind: 'parked', value: 'Task steps' }]);
    expect(field).toHaveValue('');
    expect(screen.getByText('focus.park.added')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(useTaskStore.getState().tasks.some((t) => t.title === 'Rename the config flag')).toBe(true);
  });

  it('comes back from a reload after time ran out on "How did that go?", without a chime', async () => {
    useFocusStore.setState({
      timer: {
        projectId: PROJECT.id,
        taskId: 'gone',
        taskTitle: 'A task from another project',
        lengthMinutes: 25,
        addedMinutes: 0,
        startedAt: NOW.getTime() - 60 * MIN,
        pausedAt: null,
        pausedMs: 0,
        endedAt: null
      },
      open: false
    });
    vi.setSystemTime(NOW.getTime());
    await act(async () => {
      await useFocusStore.persist.rehydrate();
    });
    renderFocus();
    await settle();

    expect(screen.getByRole('heading', { name: 'focus.ended.title' })).toBeInTheDocument();
    expect(screen.getByText(/A task from another project/)).toBeInTheDocument();
    expect(playFocusChime).not.toHaveBeenCalled();
  });
});
