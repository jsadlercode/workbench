/**
 * @vitest-environment jsdom
 */
/**
 * The sidebar's Focus row (time left, Paused, Time's up; opens focus mode) and the focus summary
 * line in a task's details.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { FocusSession, Task } from '../../../../shared/types';
import { FocusSidebarRow } from '../FocusSidebarRow';
import { FocusSessionsSummary } from '../../task-detail/FocusSessionsSummary';
import { useFocusStore } from '../../../stores/focus-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'en' }
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey
}));

const NOW = new Date(2026, 9, 28, 10, 0).getTime();
const TIMER = {
  projectId: 'project-1',
  taskId: 'task-1',
  taskTitle: 'Task',
  lengthMinutes: 25,
  addedMinutes: 0,
  startedAt: NOW,
  pausedAt: null,
  pausedMs: 0,
  endedAt: null
};

const row = () => screen.getByRole('button', { name: /actions\.focus|focus\.rowLabel/ });

describe('FocusSidebarRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sessionStorage.clear();
    useFocusStore.setState({ timer: null, open: false, preselectedTaskId: null, note: '' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens focus mode, and is disabled without a project', () => {
    const { rerender } = render(<FocusSidebarRow className="" collapsed={false} disabled={false} />);
    fireEvent.click(row());
    expect(useFocusStore.getState().open).toBe(true);

    rerender(<FocusSidebarRow className="" collapsed={false} disabled />);
    expect(row()).toBeDisabled();
  });

  it("shows the time left while running, Paused, and Time's up", () => {
    useFocusStore.setState({ timer: TIMER });
    render(<FocusSidebarRow className="" collapsed={false} disabled />);
    // A timer that exists can be opened without a project
    expect(row()).toBeEnabled();
    expect(row()).toHaveTextContent('25:00');

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(row()).toHaveTextContent('23:30');
    expect(row()).toHaveAccessibleName('focus.rowLabel:focus.timeLeft:23:30');

    act(() => useFocusStore.getState().pause());
    expect(row()).toHaveTextContent('focus.paused');

    act(() => useFocusStore.getState().stop());
    expect(row()).toHaveTextContent('focus.timeUp');
  });
});

describe('FocusSessionsSummary', () => {
  const session = (focusedSeconds: number): FocusSession => ({
    startedAt: '2026-10-28T09:00:00.000Z',
    endedAt: '2026-10-28T09:25:00.000Z',
    focusedSeconds,
    plannedMinutes: 25,
    outcome: 'progress'
  });
  const task = (focusSessions?: FocusSession[]) => ({ id: 'task-1', metadata: { focusSessions } }) as Task;

  it('sums the sessions in hours and minutes', () => {
    render(<FocusSessionsSummary task={task([session(25 * 60), session(25 * 60), session(25 * 60)])} />);
    expect(screen.getByText('focus.detail.summary:3,focus.duration.hoursMinutes:1,15')).toBeInTheDocument();
  });

  it('shows nothing before the first session', () => {
    const { container } = render(<FocusSessionsSummary task={task()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
