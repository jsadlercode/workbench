/**
 * @vitest-environment jsdom
 */
/**
 * The board's Up next bar: hidden without suggestions, the top 3 with "Show all", a Queue button
 * that takes the drag's path to the Queue (persistTaskStatus -> updateTaskStatus), and a collapsed
 * state that is remembered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import type { Task, TaskMetadata, TaskStatus } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { KanbanBoard } from '../KanbanBoard';
import { useUpNextStore } from '../../stores/up-next-store';

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

// Wednesday 28 Oct 2026: this week starts Monday 26 Oct
const NOW = new Date(2026, 9, 28, 10, 0);

function task(id: string, metadata: TaskMetadata = {}, status: TaskStatus = 'backlog', createdDaysAgo = 0): Task {
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
    createdAt: new Date(NOW.getTime() - createdDaysAgo * 86_400_000),
    updatedAt: NOW
  };
}

/** `count` flagged Backlog tasks, newest first (the Backlog's order without a saved order) */
function flaggedTasks(count: number): Task[] {
  return Array.from({ length: count }, (_, i) => task(String(i + 1), { flagged: true }, 'backlog', i));
}

const updateTaskStatus = vi.fn();

function renderBoard(tasks: Task[], onTaskClick = vi.fn()) {
  return render(
    <TooltipProvider>
      <KanbanBoard tasks={tasks} onTaskClick={onTaskClick} />
    </TooltipProvider>
  );
}

const bar = () => screen.queryByRole('region', { name: 'upNext.title' });

function items(): HTMLElement[] {
  const region = bar();
  if (!region) throw new Error('Up next bar not found');
  return within(region).queryAllByRole('listitem');
}

describe('UpNextBar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useUpNextStore.setState({ collapsed: false });
    updateTaskStatus.mockResolvedValue({ success: true });
    (window as unknown as { electronAPI: unknown }).electronAPI = { updateTaskStatus };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden without suggestions', () => {
    renderBoard([
      task('plain'),
      task('later', { plannedFor: 'later' }),
      task('queued-flagged', { flagged: true }, 'queue'),
      task('archived-flagged', { flagged: true, archivedAt: '2026-10-20T00:00:00.000Z' })
    ]);
    expect(screen.getByText('columns.backlog')).toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it('shows the top 3 with their reasons, then expands to at most 10', () => {
    renderBoard([
      ...flaggedTasks(11),
      task('overdue', { deadline: '2026-10-20', hardDeadline: true }, 'backlog', 20)
    ]);

    expect(items()).toHaveLength(3);
    // Highest score first, then the Backlog's order
    const [first, second] = items();
    expect(within(first).getByText('Task overdue')).toBeInTheDocument();
    expect(within(first).getByText('upNext.reasons.overdue')).toHaveClass('text-destructive');
    expect(within(second).getByText('Task 1')).toBeInTheDocument();
    expect(within(second).getByText('upNext.reasons.flagged')).toHaveClass('text-primary');

    fireEvent.click(screen.getByRole('button', { name: 'upNext.showAll:10' }));
    expect(items()).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'upNext.showLess' }));
    expect(items()).toHaveLength(3);
  });

  it('says a suggested task is waiting on someone, in the neutral tone', () => {
    renderBoard([
      task('waiting', { deadline: '2026-10-20', hardDeadline: true, waitingOn: 'Sam', waitingSince: '2026-10-26T09:00:00.000Z' }),
      // Flagged and waiting: 30 - 45, not suggested
      task('waiting-flagged', { flagged: true, waitingOn: 'Alex', waitingSince: '2026-10-26T09:00:00.000Z' })
    ]);
    expect(items()).toHaveLength(1);
    const reason = within(items()[0]).getByText('upNext.reasons.waiting');
    expect(reason).toHaveClass('text-(--nav-label-color)');
  });

  it('has no Show all toggle with 3 suggestions or fewer', () => {
    renderBoard(flaggedTasks(3));
    expect(items()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /upNext\.showAll/ })).not.toBeInTheDocument();
  });

  it('opens the task when its title is clicked', () => {
    const onTaskClick = vi.fn();
    const tasks = flaggedTasks(1);
    renderBoard(tasks, onTaskClick);
    fireEvent.click(within(items()[0]).getByText('Task 1'));
    expect(onTaskClick).toHaveBeenCalledWith(tasks[0]);
  });

  it('moves the task to the Queue the way a drag does, disabled while it moves', async () => {
    let resolve: (value: { success: boolean }) => void = () => {};
    updateTaskStatus.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderBoard(flaggedTasks(2));

    const queue = screen.getByRole('button', { name: 'upNext.queueAriaLabel:Task 1' });
    fireEvent.click(queue);

    expect(updateTaskStatus).toHaveBeenCalledWith('1', 'queue', undefined);
    expect(queue).toBeDisabled();
    // Only the task being moved
    expect(screen.getByRole('button', { name: 'upNext.queueAriaLabel:Task 2' })).toBeEnabled();

    await act(async () => resolve({ success: true }));
    await waitFor(() => expect(queue).toBeEnabled());
  });

  it('shows why queueing failed next to the task', async () => {
    updateTaskStatus.mockResolvedValue({ success: false, error: 'Disk full' });
    renderBoard(flaggedTasks(2));

    fireEvent.click(screen.getByRole('button', { name: 'upNext.queueAriaLabel:Task 2' }));

    const alert = await within(items()[1]).findByRole('alert');
    expect(alert).toHaveTextContent('upNext.queueFailed:Disk full');
    expect(within(items()[0]).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'upNext.queueAriaLabel:Task 2' })).toBeEnabled();
  });

  it('collapses to one line and remembers it', async () => {
    const { unmount } = renderBoard(flaggedTasks(4));

    fireEvent.click(screen.getByRole('button', { name: 'upNext.collapse' }));

    const summary = within(bar()!).getByRole('button', { expanded: false });
    expect(summary).toHaveTextContent('upNext.title');
    expect(summary).toHaveTextContent('upNext.suggestions:4');
    expect(items()).toHaveLength(0);

    // Kept in localStorage: a fresh store (as after a restart) reads it back
    vi.resetModules();
    const { useUpNextStore: freshStore } = await import('../../stores/up-next-store');
    expect(freshStore.getState().collapsed).toBe(true);

    // And the board shows it collapsed when opened again
    unmount();
    renderBoard(flaggedTasks(4));
    expect(items()).toHaveLength(0);
    fireEvent.click(within(bar()!).getByRole('button', { expanded: false }));
    expect(items()).toHaveLength(3);
    expect(useUpNextStore.getState().collapsed).toBe(false);
  });
});
