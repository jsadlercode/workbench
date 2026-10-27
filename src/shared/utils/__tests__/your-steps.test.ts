import { describe, it, expect } from 'vitest';
import { getYourSteps, withYourStepDone } from '../your-steps';
import type { ClaudeRunInfo } from '../../types/claude-code';

const task = (yourSteps: string[] | undefined, yourStepsDone?: string[]) => ({
  claudeRun: {
    version: 1,
    phases: [],
    subagents: [],
    totalCostUsd: 0,
    updatedAt: '',
    validation: { status: 'passed', summary: '', checks: [], findings: [], yourSteps },
  } as ClaudeRunInfo,
  metadata: yourStepsDone ? { yourStepsDone } : undefined,
});

describe('getYourSteps', () => {
  it('marks the ticked steps done and counts the open ones', () => {
    expect(getYourSteps(task(['Send the email', 'Call Sam', 'Add the secret'], ['Call Sam']))).toEqual({
      steps: [
        { text: 'Send the email', done: false },
        { text: 'Call Sam', done: true },
        { text: 'Add the secret', done: false },
      ],
      open: 2,
      total: 3,
    });
  });

  it('keeps a tick for a step a revision listed again, and ignores ticks of steps no longer listed', () => {
    expect(getYourSteps(task(['Call Sam', 'Test on an iPhone'], ['Call Sam', 'Send the email']))).toMatchObject({ open: 1, total: 2 });
  });

  it('has no steps without a run, a validation or a list (reports saved before steps existed)', () => {
    const empty = { steps: [], open: 0, total: 0 };
    expect(getYourSteps({})).toEqual(empty);
    expect(getYourSteps({ claudeRun: { ...task(undefined).claudeRun, validation: undefined } })).toEqual(empty);
    expect(getYourSteps(task(undefined))).toEqual(empty);
    expect(getYourSteps(task([], ['Call Sam']))).toEqual(empty);
  });
});

describe('withYourStepDone', () => {
  it('ticks and unticks a step, keeping the list order', () => {
    const steps = ['Send the email', 'Call Sam', 'Add the secret'];
    expect(withYourStepDone(task(steps, ['Add the secret']), 'Send the email', true)).toEqual(['Send the email', 'Add the secret']);
    expect(withYourStepDone(task(steps, ['Send the email', 'Add the secret']), 'Send the email', false)).toEqual(['Add the secret']);
  });

  it('drops ticks of steps the run no longer lists', () => {
    expect(withYourStepDone(task(['Call Sam'], ['Old step']), 'Call Sam', true)).toEqual(['Call Sam']);
  });
});
