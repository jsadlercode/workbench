/**
 * @vitest-environment jsdom
 */
/**
 * The board's capture bar: Add creates a Backlog task through the dialog's path (createTask ->
 * window.electronAPI.createTask) with the typed description, the chosen week's `plannedFor` and
 * the dialog's defaults; Enter adds and keeps the focus for the next one; N focuses the field;
 * the When choice is remembered; a failed create keeps the text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { Project, Task, TaskMetadata } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { QuickCaptureBar } from '../QuickCaptureBar';
import { KanbanBoard } from '../KanbanBoard';
import { useQuickCaptureStore } from '../../stores/quick-capture-store';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useTaskStore } from '../../stores/task-store';

// Return keys (with interpolated values) so assertions don't depend on English copy
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'en' }
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey
}));

vi.mock('../../contexts/ViewStateContext', () => ({
  useViewState: () => ({ showArchived: false, toggleShowArchived: vi.fn() })
}));

// Wednesday 28 Oct 2026: this week starts Monday 26 Oct, next week Monday 2 Nov
const NOW = new Date(2026, 9, 28, 10, 0);

const PROJECT: Project = {
  id: 'project-1',
  name: 'Project',
  path: '/repo',
  autoBuildPath: '.workbench',
  settings: { model: 'opus', notifications: { onTaskComplete: true, onTaskFailed: true, onReviewNeeded: true, sound: false }, mainBranch: 'develop' },
  createdAt: NOW,
  updatedAt: NOW
};

function createdTask(description: string, metadata: TaskMetadata): Task {
  return {
    id: '001-task',
    specId: '001-task',
    projectId: PROJECT.id,
    title: 'Generated title',
    description,
    status: 'backlog',
    subtasks: [],
    logs: [],
    metadata,
    createdAt: NOW,
    updatedAt: NOW
  };
}

const createTask = vi.fn();
const getGitBranchesWithInfo = vi.fn();
const detectMainBranch = vi.fn();

async function renderBar() {
  const result = render(
    <>
      <QuickCaptureBar projectId={PROJECT.id} />
      <textarea aria-label="other field" />
      <button type="button">elsewhere</button>
    </>
  );
  // Let the branch list (the dialog's background listing) settle
  await act(async () => {});
  return result;
}

const field = () => screen.getByRole('textbox', { name: 'tasks:capture.placeholder' });
const addButton = () => screen.getByRole('button', { name: 'common:buttons.add' });
const whenOption = (choice: string) => screen.getByRole('radio', { name: `tasks:planning.choices.${choice}` });

function type(text: string) {
  fireEvent.change(field(), { target: { value: text } });
}

describe('QuickCaptureBar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    useQuickCaptureStore.setState({ when: 'this_week' });
    useProjectStore.setState({ projects: [PROJECT] });
    useTaskStore.setState({ tasks: [], error: null });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, mcpConnectors: { context7Enabled: true, electronEnabled: false, puppeteerEnabled: true } }
    }));
    createTask.mockReset();
    createTask.mockImplementation(async (_projectId: string, _title: string, description: string, metadata: TaskMetadata) => ({
      success: true,
      data: createdTask(description, metadata)
    }));
    getGitBranchesWithInfo.mockResolvedValue({ success: true, data: [] });
    detectMainBranch.mockResolvedValue({ success: true, data: 'main' });
    (window as unknown as { electronAPI: unknown }).electronAPI = { createTask, getGitBranchesWithInfo, detectMainBranch };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['this_week', '2026-10-26'],
    ['next_week', '2026-11-02'],
    ['later', 'later']
  ])('adds a Backlog task planned for %s with the dialog defaults', async (choice, plannedFor) => {
    await renderBar();
    fireEvent.click(whenOption(choice));
    type('  Fix the login redirect  ');
    fireEvent.click(addButton());

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    // A short capture is its own title (no generated one). The project's default branch, the
    // Connectors defaults, and nothing that queues or starts the task
    expect(createTask).toHaveBeenCalledWith(PROJECT.id, 'Fix the login redirect', 'Fix the login redirect', {
      sourceType: 'manual',
      baseBranch: 'develop',
      mcpConnectors: ['context7', 'puppeteer'],
      plannedFor
    });
    expect(await screen.findByRole('status')).toHaveTextContent('tasks:capture.added');
    expect(useTaskStore.getState().tasks.map((task) => task.status)).toEqual(['backlog']);
  });

  it('leaves the title empty for a long capture, so one is generated', async () => {
    await renderBar();
    const long = 'Draft the email to House Labs asking for the PHP version, the patch date and a full site backup';
    type(long);
    fireEvent.click(addButton());

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith(PROJECT.id, '', long, expect.any(Object));
  });

  it('keeps Add disabled while the text is empty', async () => {
    await renderBar();
    expect(addButton()).toBeDisabled();

    type('   ');
    expect(addButton()).toBeDisabled();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(createTask).not.toHaveBeenCalled();

    type('Write the release notes');
    expect(addButton()).toBeEnabled();
  });

  it('adds on Enter, then clears the field and keeps the focus in it', async () => {
    let finish: (value: unknown) => void = () => {};
    createTask.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderBar();
    field().focus();
    type('Rename the settings page');
    fireEvent.keyDown(field(), { key: 'Enter' });

    // While the task is being added: Add is disabled and the text stays, read-only
    expect(createTask).toHaveBeenCalledWith(PROJECT.id, 'Rename the settings page', 'Rename the settings page', expect.any(Object));
    expect(addButton()).toBeDisabled();
    expect(field()).toHaveAttribute('readonly');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(createTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ success: true, data: createdTask('Rename the settings page', {}) });
    });
    expect(field()).toHaveValue('');
    expect(field()).not.toHaveAttribute('readonly');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('tasks:capture.added');

    // Straight on to the next one
    type('Second thought');
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(field()).toHaveFocus();
  });

  it('returns the focus to the field after clicking Add', async () => {
    await renderBar();
    type('Check the docs links');
    addButton().focus();
    fireEvent.click(addButton());
    await waitFor(() => expect(field()).toHaveValue(''));
    expect(field()).toHaveFocus();
  });

  it('leaves the field on Esc', async () => {
    await renderBar();
    field().focus();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).not.toHaveFocus();
  });

  it('focuses the field on N, but not while typing elsewhere or with a dialog open', async () => {
    await renderBar();

    // From the page: focused, and the N isn't typed into the field
    expect(fireEvent.keyDown(document.body, { key: 'n' })).toBe(false);
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('');

    // Typing in another field
    const other = screen.getByRole('textbox', { name: 'other field' });
    other.focus();
    expect(fireEvent.keyDown(other, { key: 'n' })).toBe(true);
    expect(other).toHaveFocus();

    // Editable text
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    fireEvent.keyDown(editable, { key: 'n' });
    expect(field()).not.toHaveFocus();
    editable.remove();

    // With a modifier (Cmd+N and the like belong to others)
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    elsewhere.focus();
    fireEvent.keyDown(elsewhere, { key: 'n', metaKey: true });
    fireEvent.keyDown(elsewhere, { key: 'n', ctrlKey: true });
    expect(elsewhere).toHaveFocus();

    // With a dialog open
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    fireEvent.keyDown(elsewhere, { key: 'N' });
    expect(elsewhere).toHaveFocus();
    dialog.remove();

    // And again once it's closed (Shift+N too)
    fireEvent.keyDown(elsewhere, { key: 'N', shiftKey: true });
    expect(field()).toHaveFocus();
  });

  it('remembers the When choice, starting with This week', async () => {
    const { unmount } = await renderBar();
    expect(whenOption('this_week')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(whenOption('next_week'));
    expect(whenOption('next_week')).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem('kanban-quick-capture') ?? '{}')).toMatchObject({ state: { when: 'next_week' } });
    unmount();

    await renderBar();
    expect(whenOption('next_week')).toHaveAttribute('aria-checked', 'true');
    type('Plan the sprint');
    fireEvent.click(addButton());
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask.mock.calls[0][3]).toMatchObject({ plannedFor: '2026-11-02' });
  });

  it('reads the stored When choice back, and ignores one it does not offer', async () => {
    localStorage.setItem('kanban-quick-capture', JSON.stringify({ state: { when: 'later' }, version: 0 }));
    await useQuickCaptureStore.persist.rehydrate();
    expect(useQuickCaptureStore.getState().when).toBe('later');

    useQuickCaptureStore.setState({ when: 'this_week' });
    localStorage.setItem('kanban-quick-capture', JSON.stringify({ state: { when: 'unplanned' }, version: 0 }));
    await useQuickCaptureStore.persist.rehydrate();
    expect(useQuickCaptureStore.getState().when).toBe('this_week');
  });

  it('shows why a create failed and keeps the text', async () => {
    createTask.mockResolvedValueOnce({ success: false, error: 'Project not found' });
    await renderBar();
    field().focus();
    type('Update the changelog');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('tasks:capture.failed:Project not found');
    expect(field()).toHaveValue('Update the changelog');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(addButton()).toBeEnabled();

    // Editing the text clears the error; trying again works
    type('Update the changelog for 2.0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(addButton());
    await waitFor(() => expect(field()).toHaveValue(''));
  });

  it('sits on the board, also before the project has tasks', async () => {
    render(
      <TooltipProvider>
        <KanbanBoard tasks={[]} projectId={PROJECT.id} onTaskClick={vi.fn()} />
      </TooltipProvider>
    );
    await act(async () => {});
    expect(screen.getByRole('region', { name: 'tasks:capture.title' })).toBeInTheDocument();
  });
});
