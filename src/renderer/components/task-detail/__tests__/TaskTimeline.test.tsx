/**
 * @vitest-environment jsdom
 */
/**
 * The task's timeline: when it was added, its state entries from the project's history (repeats
 * collapsed, Claude Code's marked), its activity and focus sessions, newest first; the newest 12
 * with Show all; the history loaded once per project and again when the task's status changes;
 * the other entries shown while it loads and when it fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { IPCResult, Task, TaskActivity, TaskHistoryEntry, TaskMetadata, TaskStatus } from '../../../../shared/types';
import { TaskTimeline } from '../TaskTimeline';
import { useTaskHistoryStore } from '../../../stores/task-history-store';
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

// Tuesday 27 Oct 2026, 18:00 local
const NOW = new Date(2026, 9, 27, 18, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

function task(status: TaskStatus = 'human_review', metadata: TaskMetadata = {}): Task {
  return {
    id: '001-report',
    specId: '001-report',
    projectId: 'p1',
    title: 'Write the report',
    description: '',
    status,
    subtasks: [],
    logs: [],
    metadata,
    createdAt: new Date(2026, 9, 26, 9, 0),
    updatedAt: NOW
  };
}

const getTaskHistory = vi.fn<(projectId: string) => Promise<IPCResult<TaskHistoryEntry[]>>>();

/** Each row's time, text and whether it is marked as Claude Code's */
function rows() {
  return screen.getAllByRole('listitem').map((item) => {
    const line = item.querySelector('p');
    return {
      time: item.querySelector('time')?.textContent,
      text: line?.firstElementChild?.textContent,
      claudeCode: line?.textContent?.includes('timeline.claudeCode') ?? false
    };
  });
}

async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  useTaskHistoryStore.setState({ byProject: {} });
  useTaskStore.setState({ tasks: [] });
  getTaskHistory.mockReset();
  getTaskHistory.mockResolvedValue({ success: true, data: [] });
  (window as unknown as { electronAPI: unknown }).electronAPI = { getTaskHistory };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TaskTimeline', () => {
  it('merges the sources newest first, collapsing repeated states and marking Claude Code', async () => {
    getTaskHistory.mockResolvedValue({
      success: true,
      data: [
        // The task starts in the Backlog: not a move back to it
        { at: at(26, 9, 59), task: '001-report', status: 'backlog', state: 'backlog' },
        { at: at(26, 10), task: '001-report', status: 'in_progress', state: 'planning' },
        { at: at(26, 10, 5), task: '001-report', status: 'in_progress', state: 'coding' },
        // A repeat (the same state again) and another task's entry are left out
        { at: at(26, 10, 6), task: '001-report', status: 'in_progress', state: 'coding' },
        { at: at(26, 10, 7), task: '002-other', status: 'done' },
        { at: at(26, 10, 30), task: '001-report', status: 'ai_review', state: 'qa_review' },
        { at: at(26, 11), task: '001-report', status: 'human_review', state: 'human_review' },
        // Moved by the user: not Claude Code's, and the review after it isn't a run's either
        { at: at(27, 9), task: '001-report', status: 'backlog' },
        { at: at(27, 9, 30), task: '001-report', status: 'human_review' }
      ]
    });
    const activity: TaskActivity[] = [
      { at: at(26, 9, 30), kind: 'planned', value: '2026-10-26' },
      { at: at(27, 12), kind: 'step_done', value: 'Send the email' },
      { at: at(27, 12), kind: 'waiting', value: 'Sam' }
    ];
    render(
      <TaskTimeline
        task={task('human_review', {
          activity,
          focusSessions: [
            { startedAt: at(27, 13), endedAt: at(27, 13, 25), focusedSeconds: 1500, plannedMinutes: 25, outcome: 'progress', note: 'Halfway' }
          ]
        })}
      />
    );
    await settle();

    expect(getTaskHistory).toHaveBeenCalledWith('p1');
    expect(rows()).toEqual([
      { time: '27 Oct, 1:25 PM', text: 'timeline.focusSession:focus.duration.minutes:25,timeline.outcomes.progress', claudeCode: false },
      // Two changes saved together: the later one first
      { time: '27 Oct, 12:00 PM', text: 'timeline.activity.waiting:Sam', claudeCode: false },
      { time: '27 Oct, 12:00 PM', text: 'timeline.activity.stepDone:Send the email', claudeCode: false },
      { time: '27 Oct, 9:30 AM', text: 'timeline.states.human_review', claudeCode: false },
      { time: '27 Oct, 9:00 AM', text: 'timeline.states.backlog', claudeCode: false },
      { time: '26 Oct, 11:00 AM', text: 'timeline.states.human_review_run', claudeCode: true },
      { time: '26 Oct, 10:30 AM', text: 'timeline.states.qa_review', claudeCode: true },
      { time: '26 Oct, 10:05 AM', text: 'timeline.states.coding', claudeCode: true },
      { time: '26 Oct, 10:00 AM', text: 'timeline.states.planning', claudeCode: true },
      { time: '26 Oct, 9:30 AM', text: 'timeline.activity.plannedWeek:26 Oct', claudeCode: false },
      { time: '26 Oct, 9:00 AM', text: 'timeline.created', claudeCode: false }
    ]);
    // The session's note shows under it
    expect(screen.getByText('Halfway')).toBeInTheDocument();
  });

  it('shows each kind of change, and a failed run as Claude Code’s', async () => {
    getTaskHistory.mockResolvedValue({
      success: true,
      data: [{ at: at(27, 8), task: '001-report', status: 'human_review', state: 'error' }]
    });
    const activity: TaskActivity[] = [
      { at: at(26, 10, 1), kind: 'planned', value: 'later' },
      { at: at(26, 10, 2), kind: 'planned' },
      { at: at(26, 10, 3), kind: 'deadline', value: '2026-11-03', hard: true },
      { at: at(26, 10, 4), kind: 'deadline', value: '2027-01-15' },
      { at: at(26, 10, 5), kind: 'deadline' },
      { at: at(26, 10, 6), kind: 'flagged' },
      { at: at(26, 10, 7), kind: 'unflagged' },
      { at: at(26, 10, 8), kind: 'stopped_waiting' },
      { at: at(26, 10, 9), kind: 'step_reopened', value: 'Call Sam' },
      { at: at(26, 10, 10), kind: 'renamed', value: 'Write the report' },
      { at: at(26, 10, 11), kind: 'parked', value: 'Plan the week' }
    ];
    render(<TaskTimeline task={task('human_review', { activity })} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'timeline.showAll:13' }));

    expect(rows().map((row) => row.text)).toEqual([
      'timeline.states.error',
      'timeline.activity.parked:Plan the week',
      'timeline.activity.renamed:Write the report',
      'timeline.activity.stepReopened:Call Sam',
      'timeline.activity.stoppedWaiting',
      'timeline.activity.unflagged',
      'timeline.activity.flagged',
      'timeline.activity.deadlineCleared',
      'timeline.activity.deadline:15 Jan 2027',
      'timeline.activity.hardDeadline:3 Nov',
      'timeline.activity.unplanned',
      'timeline.activity.plannedLater',
      'timeline.created'
    ]);
    expect(rows()[0].claudeCode).toBe(true);
  });

  it('shows the newest 12, the rest behind Show all', async () => {
    const activity: TaskActivity[] = Array.from({ length: 14 }, (_, i) => ({ at: at(27, 9, i), kind: i % 2 ? 'unflagged' : 'flagged' }));
    render(<TaskTimeline task={task('backlog', { activity })} />);
    await settle();

    expect(rows()).toHaveLength(12);
    expect(rows()[0].time).toBe('27 Oct, 9:13 AM');
    fireEvent.click(screen.getByRole('button', { name: 'timeline.showAll:15' }));
    expect(rows()).toHaveLength(15);
    expect(rows().at(-1)?.text).toBe('timeline.created');
    fireEvent.click(screen.getByRole('button', { name: 'timeline.showLess' }));
    expect(rows()).toHaveLength(12);
  });

  it('shows the year for an entry from another year', async () => {
    render(<TaskTimeline task={{ ...task('backlog'), createdAt: new Date(2025, 11, 30, 16, 45) }} />);
    await settle();

    expect(rows()).toEqual([{ time: '30 Dec 2025, 4:45 PM', text: 'timeline.created', claudeCode: false }]);
  });

  it('shows the other entries while the history loads, and when it fails, with a quiet line', async () => {
    let finish: (result: IPCResult<TaskHistoryEntry[]>) => void = () => {};
    getTaskHistory.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<TaskTimeline task={task('backlog', { activity: [{ at: at(27, 9), kind: 'flagged' }] })} />);
    await settle();

    expect(rows().map((row) => row.text)).toEqual(['timeline.activity.flagged', 'timeline.created']);
    expect(screen.queryByText('timeline.loadFailed')).not.toBeInTheDocument();

    await act(async () => finish({ success: false, error: 'Project not found' }));

    expect(rows()).toHaveLength(2);
    expect(screen.getByText('timeline.loadFailed')).toBeInTheDocument();
  });

  it('loads the history once per project, and again a moment after the task changes status', async () => {
    useTaskStore.setState({ tasks: [task('backlog')] });
    const view = render(<TaskTimeline task={task('backlog')} />);
    await settle();
    view.unmount();

    // Opened again (or another of the project's tasks): no new load
    const again = render(<TaskTimeline task={task('backlog')} />);
    await settle();
    expect(getTaskHistory).toHaveBeenCalledTimes(1);

    // The task starts while its details are open: the new state entry is loaded shortly after
    getTaskHistory.mockResolvedValue({
      success: true,
      data: [{ at: at(27, 17, 59), task: '001-report', status: 'in_progress', state: 'planning' }]
    });
    useTaskStore.setState({ tasks: [task('in_progress')] });
    again.rerender(<TaskTimeline task={task('in_progress')} />);
    await settle();
    expect(getTaskHistory).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(getTaskHistory).toHaveBeenCalledTimes(2);
    expect(rows()[0]).toEqual({ time: '27 Oct, 5:59 PM', text: 'timeline.states.planning', claudeCode: true });
    again.unmount();

    // Opened later with the status it had at that load: no new load
    render(<TaskTimeline task={task('in_progress')} />);
    await settle();
    expect(getTaskHistory).toHaveBeenCalledTimes(2);
  });

  it('loads again on open when the task changed status while its details were closed', async () => {
    useTaskStore.setState({ tasks: [task('backlog')] });
    render(<TaskTimeline task={task('backlog')} />).unmount();
    await settle();

    render(<TaskTimeline task={task('done')} />);
    await settle();
    expect(getTaskHistory).toHaveBeenCalledTimes(2);
  });
});
