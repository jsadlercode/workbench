/**
 * "Your steps": what a task's Claude Code run handed back for the user to do themselves
 * (`claudeRun.validation.yourSteps`), with the ones the user ticked off
 * (`metadata.yourStepsDone`, kept by step text).
 */
import type { Task } from '../types/task';

export interface YourStep {
  text: string;
  done: boolean;
}

export interface YourStepsState {
  steps: YourStep[];
  /** Steps not ticked yet */
  open: number;
  total: number;
}

type YourStepsTask = Pick<Task, 'claudeRun' | 'metadata'>;

/** A task's steps in the order the run listed them, each marked done when the user ticked it */
export function getYourSteps(task: YourStepsTask): YourStepsState {
  const listed = task.claudeRun?.validation?.yourSteps;
  if (!Array.isArray(listed) || listed.length === 0) return { steps: [], open: 0, total: 0 };
  const done = new Set(task.metadata?.yourStepsDone ?? []);
  const steps = listed.map((text) => ({ text, done: done.has(text) }));
  return { steps, open: steps.filter((step) => !step.done).length, total: steps.length };
}

/**
 * The task's ticked steps after ticking (or unticking) one, in list order. Ticks of steps the
 * current run no longer lists are dropped.
 */
export function withYourStepDone(task: YourStepsTask, text: string, done: boolean): string[] {
  return getYourSteps(task).steps
    .filter((step) => (step.text === text ? done : step.done))
    .map((step) => step.text);
}
