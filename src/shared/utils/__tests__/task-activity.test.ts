import { describe, it, expect } from 'vitest';
import type { ClaudeRunInfo } from '../../types/claude-code';
import type { TaskActivity, TaskMetadata } from '../../types/task';
import { MAX_TASK_ACTIVITY, taskActivityFor, withActivity } from '../task-activity';

const NOW = new Date(2026, 9, 28, 10, 0);
const AT = NOW.toISOString();

const diff = (before: TaskMetadata | undefined, after: TaskMetadata | undefined) =>
  taskActivityFor({ metadata: before }, { metadata: after }, NOW);

describe('taskActivityFor', () => {
  it('records nothing when nothing changes, counting missing, undefined and empty values as the same', () => {
    expect(diff(undefined, {})).toEqual([]);
    expect(diff({}, { plannedFor: undefined, deadline: undefined, hardDeadline: undefined, flagged: undefined })).toEqual([]);
    expect(diff({ flagged: false }, {})).toEqual([]);
    expect(diff({ waitingOn: '' }, { waitingOn: '   ' })).toEqual([]);
    expect(diff({ yourStepsDone: [] }, {})).toEqual([]);
    expect(diff({ plannedFor: '2026-10-26', deadline: '2026-11-03', hardDeadline: true, flagged: true, waitingOn: 'Sam', yourStepsDone: ['A', 'B'] },
      { plannedFor: '2026-10-26', deadline: '2026-11-03', hardDeadline: true, flagged: true, waitingOn: 'Sam', yourStepsDone: ['B', 'A'] })).toEqual([]);
    // Other fields aren't logged
    expect(diff({ mcpConnectors: ['context7'] }, { mcpConnectors: [], baseBranch: 'dev', userDescription: 'New' })).toEqual([]);
  });

  it('records a planned week, later, and no longer planned', () => {
    expect(diff({}, { plannedFor: '2026-10-26' })).toEqual([{ at: AT, kind: 'planned', value: '2026-10-26' }]);
    expect(diff({ plannedFor: '2026-10-26' }, { plannedFor: 'later' })).toEqual([{ at: AT, kind: 'planned', value: 'later' }]);
    expect(diff({ plannedFor: 'later' }, {})).toEqual([{ at: AT, kind: 'planned' }]);
  });

  it('records a deadline set, moved, made hard or soft, and cleared', () => {
    expect(diff({}, { deadline: '2026-11-03' })).toEqual([{ at: AT, kind: 'deadline', value: '2026-11-03' }]);
    expect(diff({}, { deadline: '2026-11-03', hardDeadline: true })).toEqual([{ at: AT, kind: 'deadline', value: '2026-11-03', hard: true }]);
    expect(diff({ deadline: '2026-11-03' }, { deadline: '2026-11-10' })).toEqual([{ at: AT, kind: 'deadline', value: '2026-11-10' }]);
    expect(diff({ deadline: '2026-11-03' }, { deadline: '2026-11-03', hardDeadline: true })).toEqual([
      { at: AT, kind: 'deadline', value: '2026-11-03', hard: true }
    ]);
    expect(diff({ deadline: '2026-11-03', hardDeadline: true }, { deadline: '2026-11-03' })).toEqual([
      { at: AT, kind: 'deadline', value: '2026-11-03' }
    ]);
    expect(diff({ deadline: '2026-11-03', hardDeadline: true }, {})).toEqual([{ at: AT, kind: 'deadline' }]);
  });

  it('ignores a hard flag without a deadline', () => {
    expect(diff({}, { hardDeadline: true })).toEqual([]);
  });

  it('records flagging and unflagging', () => {
    expect(diff({}, { flagged: true })).toEqual([{ at: AT, kind: 'flagged' }]);
    expect(diff({ flagged: true }, { flagged: false })).toEqual([{ at: AT, kind: 'unflagged' }]);
  });

  it('records waiting, waiting again on something else, and stopping', () => {
    expect(diff({}, { waitingOn: ' Sam ' })).toEqual([{ at: AT, kind: 'waiting', value: 'Sam' }]);
    expect(diff({ waitingOn: 'Sam' }, { waitingOn: 'Sam ' })).toEqual([]);
    expect(diff({ waitingOn: 'Sam' }, { waitingOn: 'House Labs reply' })).toEqual([{ at: AT, kind: 'waiting', value: 'House Labs reply' }]);
    expect(diff({ waitingOn: 'Sam' }, { waitingOn: '' })).toEqual([{ at: AT, kind: 'stopped_waiting' }]);
  });

  it('records each step ticked and unticked', () => {
    expect(diff({ yourStepsDone: ['A'] }, { yourStepsDone: ['A', 'B', 'C'] })).toEqual([
      { at: AT, kind: 'step_done', value: 'B' },
      { at: AT, kind: 'step_done', value: 'C' }
    ]);
    expect(diff({ yourStepsDone: ['A', 'B'] }, { yourStepsDone: ['B'] })).toEqual([{ at: AT, kind: 'step_reopened', value: 'A' }]);
  });

  it("doesn't count a tick dropped because the run no longer lists the step as reopened", () => {
    const claudeRun = { validation: { yourSteps: ['B', 'C'] } } as unknown as ClaudeRunInfo;
    expect(taskActivityFor({ metadata: { yourStepsDone: ['A', 'C'] } }, { metadata: { yourStepsDone: ['B'] }, claudeRun }, NOW)).toEqual([
      { at: AT, kind: 'step_done', value: 'B' },
      { at: AT, kind: 'step_reopened', value: 'C' }
    ]);
  });

  it('records a new title, not the same one or an unknown one', () => {
    expect(taskActivityFor({ title: 'Old' }, { title: ' New ' }, NOW)).toEqual([{ at: AT, kind: 'renamed', value: 'New' }]);
    expect(taskActivityFor({ title: 'Same' }, { title: 'Same ' }, NOW)).toEqual([]);
    expect(taskActivityFor({}, { title: 'New' }, NOW)).toEqual([]);
    expect(taskActivityFor({ title: 'Old' }, {}, NOW)).toEqual([]);
  });

  it('lists several changes in one update in a fixed order', () => {
    const entries = taskActivityFor(
      { title: 'Old', metadata: { flagged: true, waitingOn: 'Sam' } },
      { title: 'New', metadata: { plannedFor: 'later', deadline: '2026-11-03', yourStepsDone: ['A'] } },
      NOW
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['renamed', 'planned', 'deadline', 'unflagged', 'stopped_waiting', 'step_done']);
  });
});

describe('withActivity', () => {
  const entry = (i: number): TaskActivity => ({ at: new Date(2026, 9, 1, 9, i).toISOString(), kind: 'flagged' });

  it('appends to the entries there are, or starts a list', () => {
    expect(withActivity(undefined, [entry(1)])).toEqual([entry(1)]);
    expect(withActivity([entry(1)], [entry(2), entry(3)])).toEqual([entry(1), entry(2), entry(3)]);
  });

  it(`keeps the newest ${MAX_TASK_ACTIVITY}`, () => {
    const current = Array.from({ length: MAX_TASK_ACTIVITY }, (_, i) => entry(i));
    const result = withActivity(current, [entry(100), entry(101)]);
    expect(result).toHaveLength(MAX_TASK_ACTIVITY);
    expect(result[0]).toEqual(entry(2));
    expect(result.at(-1)).toEqual(entry(101));
  });

  it('drops stored entries that are not entries, and a stored value that is not a list', () => {
    const broken = [entry(1), null, 'text', { kind: 'flagged' }] as unknown as TaskActivity[];
    expect(withActivity(broken, [entry(2)])).toEqual([entry(1), entry(2)]);
    expect(withActivity('nope' as unknown as TaskActivity[], [entry(2)])).toEqual([entry(2)]);
  });
});
