/**
 * @vitest-environment jsdom
 */
/**
 * The weekly review page: loads every project once (tasks, task history, reviews) with a refresh
 * button, the tiles for this week, paging weeks, saving the reflection with the week's figures,
 * a past week showing the figures saved with its review, the draft surviving paging, task titles
 * opening this window's tasks, and Move all sending this week's open tasks to next week.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import type { Project, Task, TaskHistoryEntry, TaskMetadata, TaskStatus, WeeklyReview as WeeklyReviewRecord } from '../../../../shared/types';
import { WeeklyReview } from '../WeeklyReview';
import { useProjectStore } from '../../../stores/project-store';
import { useTaskStore } from '../../../stores/task-store';
import { useWeeklyReviewStore } from '../../../stores/weekly-review-store';

// Return keys (with interpolated values) so assertions don't depend on English copy
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'en' }
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey
}));

// Tuesday 27 Oct 2026, 14:00 local: this week runs Mon 26 Oct to Sun 1 Nov
const NOW = new Date(2026, 9, 27, 14, 0);
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0).toISOString();

function project(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    path: `/repo/${id}`,
    autoBuildPath: '.workbench',
    settings: {},
    createdAt: NOW,
    updatedAt: NOW
  } as unknown as Project;
}

function task(id: string, projectId: string, status: TaskStatus, metadata: TaskMetadata = {}): Task {
  return {
    id,
    specId: id,
    projectId,
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

const P1_TASKS = [
  task('a', 'p1', 'done', { plannedFor: '2026-10-26' }),
  task('b', 'p1', 'done'),
  task('c', 'p1', 'backlog', { plannedFor: '2026-10-26' }),
  task('d', 'p1', 'in_progress', {
    plannedFor: '2026-10-19',
    focusSessions: [{ startedAt: at(26, 9), endedAt: at(26, 10), focusedSeconds: 1500, plannedMinutes: 25, outcome: 'finished' }]
  })
];
const P2_TASKS = [task('e', 'p2', 'done', { plannedFor: '2026-10-19' }), task('f', 'p2', 'done')];
const HISTORY: Record<string, TaskHistoryEntry[]> = {
  p1: [
    { at: at(26, 10), task: 'a', status: 'done' },
    { at: at(27, 9), task: 'b', status: 'done' }
  ],
  p2: [
    { at: at(21), task: 'e', status: 'done' },
    { at: at(27, 11), task: 'f', status: 'done' }
  ]
};

const LAST_WEEK_REVIEW: WeeklyReviewRecord = {
  weekStart: '2026-10-19',
  overall: 4,
  energy: 2,
  wentWell: 'Shipped it',
  gotInTheWay: '',
  tryNext: '',
  stats: { done: 9, planned: 10, plannedDone: 8, unplanned: 1, carried: 2, focusSeconds: 0, sessions: 0, hardMissed: 1 },
  savedAt: '2026-10-25T18:00:00.000Z'
};

const getTasks = vi.fn();
const getTaskHistory = vi.fn();
const getWeeklyReviews = vi.fn();
const saveWeeklyReview = vi.fn();
const updateTask = vi.fn();
const onOpenTask = vi.fn();

function renderPage() {
  return render(<WeeklyReview onOpenTask={onOpenTask} />);
}

const tiles = () => within(screen.getByRole('list', { name: 'weeklyReview.tiles.label' }));
const section = (name: string) => within(screen.getByRole('region', { name }));

async function loaded() {
  await screen.findByRole('list', { name: 'weeklyReview.tiles.label' });
}

describe('WeeklyReview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    getTasks.mockImplementation(async (projectId: string) => ({
      success: true,
      data: projectId === 'p1' ? P1_TASKS : P2_TASKS
    }));
    getTaskHistory.mockImplementation(async (projectId: string) => ({ success: true, data: HISTORY[projectId] ?? [] }));
    getWeeklyReviews.mockResolvedValue({ success: true, data: [LAST_WEEK_REVIEW] });
    saveWeeklyReview.mockImplementation(async (review: WeeklyReviewRecord) => ({
      success: true,
      data: { ...review, savedAt: '2026-10-27T13:00:00.000Z' }
    }));
    updateTask.mockImplementation(async (id: string, updates: { metadata: TaskMetadata }, projectId: string) => {
      const current = [...P1_TASKS, ...P2_TASKS].find((t) => t.id === id && t.projectId === projectId)!;
      const slippedWeeks = id === 'd' ? ['2026-10-19', '2026-10-26'] : ['2026-10-26'];
      return { success: true, data: { ...current, metadata: { ...current.metadata, ...updates.metadata, slippedWeeks } } };
    });
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      getTasks,
      getTaskHistory,
      getWeeklyReviews,
      saveWeeklyReview,
      updateTask
    };
    useProjectStore.setState({ projects: [project('p1'), project('p2')], activeProjectId: 'p1', selectedProjectId: 'p1' });
    useTaskStore.setState({ tasks: [] });
    useWeeklyReviewStore.setState({
      status: 'idle',
      loadFailed: false,
      tasks: [],
      doneTimes: new Map(),
      reviews: {},
      drafts: {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    onOpenTask.mockReset();
  });

  it("loads every project once and shows this week's figures", async () => {
    const { unmount } = renderPage();
    await loaded();

    expect(getTasks).toHaveBeenCalledTimes(2);
    expect(getTaskHistory).toHaveBeenCalledTimes(2);
    expect(getWeeklyReviews).toHaveBeenCalledTimes(1);

    // Finished: a (planned), b and f (unplanned). Planned: a, c, d (carried over from last week)
    expect(tiles().getByText('weeklyReview.tiles.finished').parentElement).toHaveTextContent('3');
    expect(tiles().getByText('weeklyReview.tiles.unplanned:2')).toBeInTheDocument();
    expect(tiles().getByText('33%')).toBeInTheDocument();
    expect(tiles().getByText('weeklyReview.tiles.plannedOf:1,3')).toBeInTheDocument();
    expect(tiles().getByText('focus.duration.minutes:25')).toBeInTheDocument();
    expect(tiles().getByText('weeklyReview.tiles.stillOpen').parentElement).toHaveTextContent('2');
    expect(tiles().getByText('weeklyReview.tiles.noHardMissed')).toBeInTheDocument();
    expect(screen.getByText('weeklyReview.weekNumber:44')).toBeInTheDocument();
    expect(screen.getByText('weeklyReview.thisWeek')).toBeInTheDocument();

    // Opening the page again shows what was loaded, without fetching
    unmount();
    renderPage();
    await loaded();
    expect(getTasks).toHaveBeenCalledTimes(2);

    // The refresh button fetches again
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.refresh' }));
    });
    expect(getTasks).toHaveBeenCalledTimes(4);
    expect(getWeeklyReviews).toHaveBeenCalledTimes(2);
  });

  it('charts each day and breaks the week down by project', async () => {
    renderPage();
    await loaded();

    const monday = document.querySelector('[data-review-day="2026-10-26"]')!;
    const tuesday = document.querySelector('[data-review-day="2026-10-27"]')!;
    expect(monday.querySelectorAll('[data-review-block]')).toHaveLength(1);
    expect(tuesday.querySelectorAll('[data-review-block]')).toHaveLength(2);
    // Today is highlighted
    expect(tuesday).toHaveClass('bg-segment-track');
    expect(monday).not.toHaveClass('bg-segment-track');

    const projects = section('weeklyReview.projects.title');
    expect(projects.getByRole('listitem', { name: 'Project p1: weeklyReview.projects.counts:2,2' })).toBeInTheDocument();
    expect(projects.getByRole('listitem', { name: 'Project p2: weeklyReview.projects.counts:1,0' })).toBeInTheDocument();
  });

  it('pages through weeks, never past this week', async () => {
    renderPage();
    await loaded();

    expect(screen.getByRole('button', { name: 'weeklyReview.nextWeek' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'weeklyReview.backToThisWeek' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.previousWeek' }));
    expect(screen.getByText('weeklyReview.weekOf:19 Oct')).toBeInTheDocument();
    expect(screen.getByText('weeklyReview.weekNumber:43')).toBeInTheDocument();
    expect(screen.queryByText('weeklyReview.thisWeek')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'weeklyReview.nextWeek' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.backToThisWeek' }));
    expect(screen.getByText('weeklyReview.weekOf:26 Oct')).toBeInTheDocument();
  });

  it("saves the reflection with this week's figures", async () => {
    renderPage();
    await loaded();
    const reflection = section('weeklyReview.reflection.title');

    fireEvent.click(within(reflection.getByRole('radiogroup', { name: 'weeklyReview.reflection.overall' })).getByRole('radio', {
      name: 'weeklyReview.reflection.overallScale.4'
    }));
    fireEvent.change(reflection.getByLabelText('weeklyReview.reflection.wentWell'), { target: { value: 'Focus mode helped' } });
    expect(reflection.getByText('weeklyReview.reflection.unsaved')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(reflection.getByRole('button', { name: 'weeklyReview.reflection.save' }));
    });

    expect(saveWeeklyReview).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStart: '2026-10-26',
        overall: 4,
        wentWell: 'Focus mode helped',
        gotInTheWay: '',
        tryNext: '',
        stats: { done: 3, planned: 3, plannedDone: 1, unplanned: 2, carried: 2, focusSeconds: 1500, sessions: 1, hardMissed: 0 }
      })
    );
    expect(reflection.getByRole('button', { name: 'weeklyReview.reflection.update' })).toBeInTheDocument();
    expect(reflection.getByText(/^weeklyReview\.reflection\.saved:/)).toBeInTheDocument();
    expect(useWeeklyReviewStore.getState().reviews['2026-10-26']).toMatchObject({ overall: 4 });
  });

  it('shows the figures saved with a past week’s review, and keeps them when the review is updated', async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.previousWeek' }));

    expect(tiles().getByText('weeklyReview.tiles.finished').parentElement).toHaveTextContent('9');
    expect(tiles().getByText('80%')).toBeInTheDocument();
    expect(tiles().getByText('weeklyReview.tiles.carriedOver').parentElement).toHaveTextContent('2');
    expect(tiles().getByText('weeklyReview.tiles.hardMissed:1')).toBeInTheDocument();
    expect(screen.getByText(/^weeklyReview\.snapshotNote:/)).toBeInTheDocument();

    const reflection = section('weeklyReview.reflection.title');
    expect(reflection.getByLabelText('weeklyReview.reflection.wentWell')).toHaveValue('Shipped it');
    fireEvent.change(reflection.getByLabelText('weeklyReview.reflection.tryNext'), { target: { value: 'Plan Monday' } });
    await act(async () => {
      fireEvent.click(reflection.getByRole('button', { name: 'weeklyReview.reflection.update' }));
    });
    expect(saveWeeklyReview).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: '2026-10-19', tryNext: 'Plan Monday', stats: LAST_WEEK_REVIEW.stats })
    );
  });

  it('keeps an unsaved draft when paging to another week and back', async () => {
    renderPage();
    await loaded();
    const field = () => section('weeklyReview.reflection.title').getByLabelText('weeklyReview.reflection.gotInTheWay');

    fireEvent.change(field(), { target: { value: 'Too many meetings' } });
    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.previousWeek' }));
    expect(field()).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.nextWeek' }));
    expect(field()).toHaveValue('Too many meetings');
  });

  it("opens this window's tasks from their titles and shows other projects' as text", async () => {
    renderPage();
    await loaded();
    const finished = section('weeklyReview.finished.title');

    fireEvent.click(finished.getByRole('button', { name: 'Task a' }));
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', projectId: 'p1' }));
    expect(finished.getByText('Task f')).toBeInTheDocument();
    expect(finished.queryByRole('button', { name: 'Task f' })).not.toBeInTheDocument();
    expect(finished.getAllByText('weeklyReview.finished.unplanned')).toHaveLength(2);
  });

  it("moves all of this week's open planned tasks to next week, in their project", async () => {
    // The window's project is on the board too: the review reads it from there, and updates it
    useTaskStore.setState({ tasks: P1_TASKS });
    renderPage();
    await loaded();
    const planned = section('weeklyReview.planned.titleThisWeek');
    expect(planned.getByText('Task c')).toBeInTheDocument();
    expect(planned.getByText('Task d')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(planned.getByRole('button', { name: 'weeklyReview.planned.moveAllNext' }));
    });

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(2));
    expect(updateTask).toHaveBeenCalledWith('c', { metadata: { plannedFor: '2026-11-02' } }, 'p1');
    expect(updateTask).toHaveBeenCalledWith('d', { metadata: { plannedFor: '2026-11-02' } }, 'p1');
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'c')?.metadata?.slippedWeeks).toEqual(['2026-10-26']);

    // Still counted for this week (they slipped from it), now planned for next week
    expect(planned.getByText('Task c')).toBeInTheDocument();
    expect(planned.getAllByText('planning.groups.next_week')).toHaveLength(2);
    expect(planned.queryByRole('button', { name: 'weeklyReview.planned.moveAllNext' })).not.toBeInTheDocument();
    expect(tiles().getByText('weeklyReview.tiles.stillOpen').parentElement).toHaveTextContent('2');
  });

  it("offers this week as the target for a past week's unfinished tasks", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'weeklyReview.previousWeek' }));
    const planned = section('weeklyReview.planned.title');

    // d was planned for last week and is still open; e was finished in it
    await act(async () => {
      fireEvent.click(planned.getByRole('button', { name: 'weeklyReview.planned.moveAllThis' }));
    });
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(updateTask).toHaveBeenCalledWith('d', { metadata: { plannedFor: '2026-10-26' } }, 'p1');
  });
});
