/**
 * @vitest-environment jsdom
 */
/**
 * Backlog planning on the board: the Backlog groups tasks by planned week (with headings) when any
 * is planned, and otherwise stays one list; both put flagged tasks and near deadlines first.
 * The card shows the flag and the deadline badge.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Task, TaskMetadata, TaskStatus } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { KanbanBoard } from '../KanbanBoard';
import { TaskCard } from '../TaskCard';

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
    title: id,
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    createdAt: new Date(NOW.getTime() - createdDaysAgo * 86_400_000),
    updatedAt: NOW
  };
}

function renderBoard(tasks: Task[]) {
  return render(
    <TooltipProvider>
      <KanbanBoard tasks={tasks} onTaskClick={vi.fn()} />
    </TooltipProvider>
  );
}

/** Group headings and card titles in the Backlog column, in DOM order */
function backlogContents(): string[] {
  const column = screen.getByText('columns.backlog').closest('.kanban-compact');
  if (!column) throw new Error('Backlog column not found');
  return Array.from(column.querySelectorAll('h3')).map((el) => el.textContent ?? '');
}

describe('KanbanBoard Backlog planning', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups planned tasks under headings with counts, in group order', () => {
    renderBoard([
      // Newest first is the order without a saved order
      task('unplanned', {}, 'backlog', 0),
      task('this-week', { plannedFor: '2026-10-26' }, 'backlog', 1),
      task('this-week-flagged', { plannedFor: '2026-10-26', flagged: true }, 'backlog', 2),
      task('carried', { plannedFor: '2026-10-19' }, 'backlog', 3),
      task('later', { plannedFor: 'later' }, 'backlog', 4),
      task('next-week', { plannedFor: '2026-11-02' }, 'backlog', 5)
    ]);

    expect(backlogContents()).toEqual([
      'planning.groups.carried_over1',
      'carried',
      'planning.groups.this_week2',
      'this-week-flagged',
      'this-week',
      'planning.groups.next_week1',
      'next-week',
      'planning.groups.later1',
      'later',
      'planning.groups.unplanned1',
      'unplanned'
    ]);
    expect(screen.getByText('planning.groups.carried_over').closest('h3')).toHaveClass('text-warning');
    expect(screen.getByText('planning.groups.this_week').closest('h3')).not.toHaveClass('text-warning');
  });

  it('keeps one list without headings when nothing is planned, flagged and near deadlines first', () => {
    renderBoard([
      task('plain', {}, 'backlog', 0),
      task('far-deadline', { deadline: '2026-12-20' }, 'backlog', 1),
      task('near-deadline', { deadline: '2026-11-02' }, 'backlog', 2),
      task('flagged', { flagged: true }, 'backlog', 3),
      task('in-progress-flagged', { flagged: true, plannedFor: '2026-10-26' }, 'in_progress', 4)
    ]);

    expect(backlogContents()).toEqual(['flagged', 'near-deadline', 'far-deadline', 'plain']);
  });
});

describe('TaskCard planning', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the flag and a hard deadline in its tone', () => {
    render(<TaskCard task={task('a', { flagged: true, deadline: '2026-11-03', hardDeadline: true })} onClick={vi.fn()} />);
    expect(screen.getByLabelText('planning.flagged')).toBeInTheDocument();
    expect(screen.getByText('planning.deadline.hard:3 Nov')).toHaveClass('text-destructive');
  });

  it('words a passed target date and keeps the deadline neutral once done', () => {
    render(<TaskCard task={task('a', { deadline: '2026-10-20' })} onClick={vi.fn()} />);
    expect(screen.getByText('planning.deadline.targetOverdue:20 Oct')).toHaveClass('text-warning');

    render(<TaskCard task={task('b', { deadline: '2026-10-20', hardDeadline: true }, 'done')} onClick={vi.fn()} />);
    const done = screen.getByText('planning.deadline.hardOverdue:20 Oct');
    expect(done).not.toHaveClass('text-destructive');
    expect(done).toHaveClass('text-(--nav-label-color)');
  });

  it('shows no badge or flag without planning', () => {
    render(<TaskCard task={task('a')} onClick={vi.fn()} />);
    expect(screen.queryByLabelText('planning.flagged')).not.toBeInTheDocument();
    expect(screen.queryByText(/planning\.deadline/)).not.toBeInTheDocument();
  });
});
