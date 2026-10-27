/**
 * A task's timeline (its details' Timeline section): when it was added, the states it entered
 * (the project's task changelog, TASK_HISTORY_GET), the changes made to it
 * (`metadata.activity`) and its focus sessions (`metadata.focusSessions`), newest first.
 *
 * Pure functions.
 */
import type { FocusSession, Task, TaskActivity, TaskStatus } from '../types/task';
import type { TaskHistoryEntry } from '../types/task-history';
import { TASK_STATE_NAMES, type TaskStateName } from '../state-machines/task-state-utils';

export type TimelineEvent =
  | { type: 'created'; at: string }
  /** `byClaudeCode`: the state came from a Claude Code run, not the user or the app */
  | { type: 'state'; at: string; state: TaskStateName; byClaudeCode: boolean }
  | { type: 'activity'; at: string; activity: TaskActivity }
  | { type: 'focus'; at: string; session: FocusSession };

/** The state an entry without a known state-machine state stands for (a manual move) */
const STATUS_STATES: Record<TaskStatus, TaskStateName> = {
  backlog: 'backlog',
  queue: 'queued',
  in_progress: 'coding',
  ai_review: 'qa_review',
  human_review: 'human_review',
  pr_created: 'pr_created',
  done: 'done',
  error: 'error'
};

const STATE_NAMES: ReadonlySet<string> = new Set(TASK_STATE_NAMES);

/** States a Claude Code run is in while it works */
const RUN_STATES: ReadonlySet<TaskStateName> = new Set<TaskStateName>(['planning', 'coding', 'qa_review', 'qa_fixing']);

function entryState(entry: TaskHistoryEntry): TaskStateName | null {
  if (entry.state && STATE_NAMES.has(entry.state)) return entry.state as TaskStateName;
  return entry.status ? STATUS_STATES[entry.status] ?? null : null;
}

function timeOf(value: unknown): number {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NaN;
}

/**
 * The task's state entries oldest first, each repeat of the state before it left out (a task
 * starts in the Backlog, so a first Backlog entry is left out too). A run's states, the failure
 * it ends in and the review it hands over (Human Review straight after a run state) are Claude
 * Code's.
 */
export function taskStateEvents(specId: string, history: readonly TaskHistoryEntry[]): Extract<TimelineEvent, { type: 'state' }>[] {
  const events: Extract<TimelineEvent, { type: 'state' }>[] = [];
  const entries = history
    .filter((entry) => entry.task === specId && Number.isFinite(timeOf(entry.at)))
    .map((entry, index) => ({ entry, index, time: timeOf(entry.at) }))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  let previous: TaskStateName = 'backlog';
  for (const { entry } of entries) {
    const state = entryState(entry);
    if (!state || state === previous) continue;
    const byClaudeCode = RUN_STATES.has(state) || state === 'error' || (state === 'human_review' && RUN_STATES.has(previous));
    events.push({ type: 'state', at: entry.at, state, byClaudeCode });
    previous = state;
  }
  return events;
}

type TimelineTask = Pick<Task, 'specId' | 'createdAt' | 'metadata'>;

/** Everything that happened to the task, newest first (things at the same moment newest first too) */
export function taskTimeline(task: TimelineTask, history: readonly TaskHistoryEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const created = timeOf(task.createdAt instanceof Date ? task.createdAt : String(task.createdAt));
  if (Number.isFinite(created)) events.push({ type: 'created', at: new Date(created).toISOString() });

  events.push(...taskStateEvents(task.specId, history));

  const activity = task.metadata?.activity;
  if (Array.isArray(activity)) {
    for (const entry of activity) {
      if (entry && typeof entry.kind === 'string') events.push({ type: 'activity', at: entry.at, activity: entry });
    }
  }

  const sessions = task.metadata?.focusSessions;
  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      // Shown when it was logged
      const at = session?.endedAt || session?.startedAt;
      if (at) events.push({ type: 'focus', at, session });
    }
  }

  return events
    .map((event, index) => ({ event, index, time: timeOf(event.at) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => b.time - a.time || b.index - a.index)
    .map(({ event }) => event);
}
