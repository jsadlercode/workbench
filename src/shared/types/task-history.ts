/**
 * A task's history: the states it entered, from the project's task changelog
 * (`.workbench/changelog.jsonl`, see src/main/task-changelog.ts)
 */
import type { TaskStatus } from './task';

/** One state a task entered (a changelog `state` entry without its file list) */
export interface TaskHistoryEntry {
  /** ISO time */
  at: string;
  /** The task's spec id (its folder in .workbench/tasks) */
  task: string;
  title?: string;
  status?: TaskStatus;
  /** State machine state (planning, coding, qa_review, ...) when known */
  state?: string;
  branch?: string;
}
