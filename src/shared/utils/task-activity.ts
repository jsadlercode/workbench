/**
 * A task's activity log (`TaskMetadata.activity`): the changes made to it that nothing else
 * records (its planned week, deadline, flag, waiting, ticked steps and title), for its timeline.
 * TASK_UPDATE diffs every update with {@link taskActivityFor} and appends with
 * {@link withActivity}, so every path that changes these fields is logged in one place.
 *
 * Pure functions.
 */
import type { Task, TaskActivity, TaskMetadata } from '../types/task';

/** Entries a task keeps; older ones are dropped */
export const MAX_TASK_ACTIVITY = 100;

/** A task before or after an update, as far as its activity is concerned */
export interface TaskActivitySnapshot {
  title?: string;
  metadata?: TaskMetadata;
  /** The run's "your steps" (a reopened step counts only while the run still lists it) */
  claudeRun?: Task['claudeRun'];
}

/** A non-empty string, else undefined (an empty or missing value is no value) */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function stepTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((step): step is string => typeof step === 'string') : [];
}

/**
 * The activity entries for an update that turns `before` into `after`, all at `now`: renamed,
 * planned (the new week, `'later'`, or no value when it is no longer planned), deadline (the new
 * date and whether it is hard, or no value when cleared), flagged / unflagged, waiting (again
 * when the text changes) / stopped_waiting, and step_done / step_reopened per step. A field that
 * stays the same (a missing value and undefined or empty text count as the same) adds nothing.
 */
export function taskActivityFor(before: TaskActivitySnapshot, after: TaskActivitySnapshot, now: Date): TaskActivity[] {
  const at = now.toISOString();
  const entries: TaskActivity[] = [];
  const was = before.metadata ?? {};
  const is = after.metadata ?? {};

  const oldTitle = text(before.title);
  const newTitle = text(after.title);
  if (oldTitle !== undefined && newTitle !== undefined && oldTitle.trim() !== newTitle.trim()) {
    entries.push({ at, kind: 'renamed', value: newTitle.trim() });
  }

  const oldPlan = text(was.plannedFor);
  const newPlan = text(is.plannedFor);
  if (oldPlan !== newPlan) {
    entries.push(newPlan === undefined ? { at, kind: 'planned' } : { at, kind: 'planned', value: newPlan });
  }

  const oldDeadline = text(was.deadline);
  const newDeadline = text(is.deadline);
  const oldHard = oldDeadline !== undefined && was.hardDeadline === true;
  const newHard = newDeadline !== undefined && is.hardDeadline === true;
  if (oldDeadline !== newDeadline || oldHard !== newHard) {
    if (newDeadline === undefined) entries.push({ at, kind: 'deadline' });
    else entries.push(newHard ? { at, kind: 'deadline', value: newDeadline, hard: true } : { at, kind: 'deadline', value: newDeadline });
  }

  const wasFlagged = was.flagged === true;
  const isFlagged = is.flagged === true;
  if (wasFlagged !== isFlagged) entries.push({ at, kind: isFlagged ? 'flagged' : 'unflagged' });

  const oldWaiting = text(was.waitingOn)?.trim();
  const newWaiting = text(is.waitingOn)?.trim();
  if (oldWaiting !== newWaiting) {
    entries.push(newWaiting === undefined ? { at, kind: 'stopped_waiting' } : { at, kind: 'waiting', value: newWaiting });
  }

  const oldSteps = stepTexts(was.yourStepsDone);
  const newSteps = stepTexts(is.yourStepsDone);
  const oldSet = new Set(oldSteps);
  const newSet = new Set(newSteps);
  for (const step of new Set(newSteps)) {
    if (!oldSet.has(step)) entries.push({ at, kind: 'step_done', value: step });
  }
  // A tick dropped because the run no longer lists the step isn't the user reopening it
  const listed = after.claudeRun?.validation?.yourSteps;
  const stillListed = Array.isArray(listed) ? new Set(listed) : null;
  for (const step of new Set(oldSteps)) {
    if (!newSet.has(step) && (!stillListed || stillListed.has(step))) {
      entries.push({ at, kind: 'step_reopened', value: step });
    }
  }

  return entries;
}

/** Whether a stored entry has the fields every entry has */
function isActivity(entry: unknown): entry is TaskActivity {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as TaskActivity).at === 'string' &&
    typeof (entry as TaskActivity).kind === 'string'
  );
}

/** The task's activity with `added` appended, keeping the newest {@link MAX_TASK_ACTIVITY} */
export function withActivity(current: readonly TaskActivity[] | undefined, added: readonly TaskActivity[]): TaskActivity[] {
  const kept = Array.isArray(current) ? current.filter(isActivity) : [];
  return [...kept, ...added].slice(-MAX_TASK_ACTIVITY);
}
