/**
 * @vitest-environment jsdom
 */
/**
 * Waiting on: the board's list of tasks waiting on someone or something (hidden when none waits,
 * longest waiting first, Stop waiting, a remembered collapsed state), and the task card's chip
 * and its menu's "Waiting on…" editor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type { Task, TaskMetadata, TaskStatus } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { KanbanBoard } from '../KanbanBoard';
import { TaskCard } from '../TaskCard';
import { WaitingBar } from '../WaitingBar';
import { useTaskStore } from '../../stores/task-store';
import { useWaitingBarStore } from '../../stores/waiting-store';

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

// Wednesday 28 Oct 2026, local time
const NOW = new Date(2026, 9, 28, 10, 0);
const daysAgo = (days: number) => new Date(2026, 9, 28 - days, 9, 0).toISOString();

function task(id: string, metadata: TaskMetadata = {}, status: TaskStatus = 'backlog'): Task {
  return {
    id,
    specId: id,
    projectId: 'project-1',
    title: `Task ${id}`,
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    createdAt: NOW,
    updatedAt: NOW
  };
}

const waitingTask = (id: string, waitingOn: string, days: number, status: TaskStatus = 'backlog') =>
  task(id, { waitingOn, waitingSince: daysAgo(days) }, status);

const updateTask = vi.fn();

/** The bar over the task store's tasks, like the board gets them */
function StoreBar({ onTaskClick = vi.fn() }: { onTaskClick?: (task: Task) => void }) {
  const tasks = useTaskStore((state) => state.tasks);
  return <WaitingBar tasks={tasks} onTaskClick={onTaskClick} />;
}

function renderBar(tasks: Task[], onTaskClick = vi.fn()) {
  useTaskStore.setState({ tasks });
  return render(<StoreBar onTaskClick={onTaskClick} />);
}

const bar = () => screen.queryByRole('region', { name: 'waiting.bar.title' });

function items(): HTMLElement[] {
  const region = bar();
  if (!region) throw new Error('Waiting on bar not found');
  return within(region).queryAllByRole('listitem');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useWaitingBarStore.setState({ collapsed: false });
  updateTask.mockReset();
  updateTask.mockResolvedValue({ success: true });
  (window as unknown as { electronAPI: unknown }).electronAPI = { updateTask };
});

afterEach(() => {
  vi.useRealTimers();
  useTaskStore.setState({ tasks: [] });
});

describe('WaitingBar', () => {
  it('stays hidden when no task waits', () => {
    renderBar([
      task('plain'),
      task('blank', { waitingOn: '  ' }),
      waitingTask('done', 'Sam', 3, 'done'),
      task('archived', { waitingOn: 'Sam', waitingSince: daysAgo(3), archivedAt: daysAgo(1) })
    ]);
    expect(bar()).not.toBeInTheDocument();
  });

  it('lists waiting tasks from any column but Done, longest waiting first, with who and how long', () => {
    renderBar([
      waitingTask('today', 'Alex', 0, 'human_review'),
      waitingTask('long', 'House Labs reply', 9, 'in_progress'),
      waitingTask('done', 'Sam', 20, 'done'),
      waitingTask('one', 'Design review', 1)
    ]);

    expect(within(bar()!).getByText('waiting.bar.count:3')).toBeInTheDocument();
    const [first, second, third] = items();
    expect(items()).toHaveLength(3);
    expect(within(first).getByText('Task long')).toBeInTheDocument();
    expect(within(first).getByText('House Labs reply')).toBeInTheDocument();
    expect(within(first).getByText('waiting.bar.forDays:9')).toBeInTheDocument();
    expect(within(second).getByText('Task one')).toBeInTheDocument();
    expect(within(second).getByText('waiting.bar.forDays:1')).toBeInTheDocument();
    expect(within(third).getByText('Task today')).toBeInTheDocument();
    expect(within(third).getByText('waiting.bar.sinceToday')).toBeInTheDocument();
  });

  it('opens the task when its title is clicked', () => {
    const onTaskClick = vi.fn();
    const tasks = [waitingTask('a', 'Sam', 2)];
    renderBar(tasks, onTaskClick);
    fireEvent.click(within(items()[0]).getByText('Task a'));
    expect(onTaskClick).toHaveBeenCalledWith(tasks[0]);
  });

  it('stops a task waiting, clearing both fields, and drops it from the list', async () => {
    renderBar([waitingTask('a', 'Sam', 2), waitingTask('b', 'Alex', 1)]);

    fireEvent.click(screen.getByRole('button', { name: 'waiting.bar.stopWaitingAriaLabel:Sam,Task a' }));

    expect(updateTask).toHaveBeenCalledWith('a', { metadata: { waitingOn: undefined, waitingSince: undefined } });
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(within(items()[0]).getByText('Task b')).toBeInTheDocument();
  });

  it('keeps the task and says so when stopping fails', async () => {
    updateTask.mockResolvedValue({ success: false, error: 'Disk full' });
    renderBar([waitingTask('a', 'Sam', 2)]);

    fireEvent.click(screen.getByRole('button', { name: 'waiting.bar.stopWaitingAriaLabel:Sam,Task a' }));

    // It leaves the list right away and comes back with the message once saving fails
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('waiting.saveFailed');
    expect(within(items()[0]).getByRole('alert')).toBe(alert);
    expect(useTaskStore.getState().tasks[0].metadata).toMatchObject({ waitingOn: 'Sam', waitingSince: daysAgo(2) });
  });

  it('shows 3 with Show all, and collapses to one line that is remembered', async () => {
    const tasks = [1, 2, 3, 4].map((n) => waitingTask(String(n), `Person ${n}`, n));
    const { unmount } = renderBar(tasks);

    expect(items()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'waiting.bar.showAll:4' }));
    expect(items()).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'waiting.bar.collapse' }));
    const summary = within(bar()!).getByRole('button', { expanded: false });
    expect(summary).toHaveTextContent('waiting.bar.count:4');
    expect(items()).toHaveLength(0);

    // Kept in localStorage: a fresh store (as after a restart) reads it back
    vi.resetModules();
    const { useWaitingBarStore: freshStore } = await import('../../stores/waiting-store');
    expect(freshStore.getState().collapsed).toBe(true);

    unmount();
    renderBar(tasks);
    expect(items()).toHaveLength(0);
    fireEvent.click(within(bar()!).getByRole('button', { expanded: false }));
    expect(items()).toHaveLength(3);
  });

  it('shows on the board', () => {
    render(
      <TooltipProvider>
        <KanbanBoard tasks={[waitingTask('a', 'Sam', 2), task('b')]} onTaskClick={vi.fn()} />
      </TooltipProvider>
    );
    expect(items()).toHaveLength(1);
    expect(within(items()[0]).getByText('Task a')).toBeInTheDocument();
  });
});

describe('TaskCard waiting', () => {
  /** The card of the store's first task, kept current like the board's */
  function StoreCard() {
    const current = useTaskStore((state) => state.tasks[0]);
    return current ? <TaskCard task={current} onClick={vi.fn()} onStatusChange={vi.fn()} /> : null;
  }

  function renderCard(metadata: TaskMetadata) {
    useTaskStore.setState({ tasks: [task('a', metadata, 'human_review')] });
    return render(<StoreCard />);
  }

  const openMenu = () =>
    fireEvent.pointerDown(screen.getByRole('button', { name: 'actions.taskActions' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse'
    });

  it('shows the chip with the full text in its tooltip', () => {
    renderCard({ waitingOn: 'House Labs reply', waitingSince: daysAgo(2) });
    const chip = screen.getByText('waiting.chip:House Labs reply');
    expect(chip).toHaveClass('truncate');
    expect(chip.parentElement).toHaveClass('text-warning');
    expect(chip.parentElement).toHaveAttribute('title', 'waiting.chipTitle:House Labs reply');
  });

  it('shows no chip and no Stop waiting when not waiting', () => {
    renderCard({});
    expect(screen.queryByText(/waiting\.chip/)).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByText('waiting.menu.waitingOn')).toBeInTheDocument();
    expect(screen.queryByText('waiting.menu.stopWaiting')).not.toBeInTheDocument();
  });

  it('sets what it waits on from the menu, starting the clock now', async () => {
    renderCard({});
    openMenu();
    fireEvent.click(screen.getByText('waiting.menu.waitingOn'));

    const input = await screen.findByLabelText('waiting.editor.label');
    fireEvent.change(input, { target: { value: ' House Labs reply ' } });
    fireEvent.submit(input.closest('form')!);

    expect(updateTask).toHaveBeenCalledWith('a', {
      metadata: { waitingOn: 'House Labs reply', waitingSince: NOW.toISOString() }
    });
    expect(await screen.findByText('waiting.chip:House Labs reply')).toBeInTheDocument();
    expect(screen.queryByLabelText('waiting.editor.label')).not.toBeInTheDocument();
  });

  it('starts the editor with the current text and cancels with Esc', async () => {
    renderCard({ waitingOn: 'Sam', waitingSince: daysAgo(2) });
    openMenu();
    fireEvent.click(screen.getByText('waiting.menu.waitingOn'));

    const input = await screen.findByLabelText('waiting.editor.label');
    expect(input).toHaveValue('Sam');
    fireEvent.change(input, { target: { value: 'Alex' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByLabelText('waiting.editor.label')).not.toBeInTheDocument());
    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.getByText('waiting.chip:Sam')).toBeInTheDocument();
  });

  it('stops waiting from the menu', async () => {
    renderCard({ waitingOn: 'Sam', waitingSince: daysAgo(2) });
    openMenu();
    fireEvent.click(screen.getByText('waiting.menu.stopWaiting'));

    expect(updateTask).toHaveBeenCalledWith('a', { metadata: { waitingOn: undefined, waitingSince: undefined } });
    await waitFor(() => expect(screen.queryByText(/waiting\.chip/)).not.toBeInTheDocument());
  });

  it('says when the change could not be saved, and undoes it', async () => {
    updateTask.mockResolvedValue({ success: false, error: 'Disk full' });
    renderCard({ waitingOn: 'Sam', waitingSince: daysAgo(2) });
    openMenu();
    fireEvent.click(screen.getByText('waiting.menu.stopWaiting'));

    expect(await screen.findByRole('alert')).toHaveTextContent('waiting.saveFailed');
    expect(screen.getByText('waiting.chip:Sam')).toBeInTheDocument();
  });
});
