/**
 * Slipped weeks: the weeks a task was planned for and moved on from before it was done, which a
 * weekly review still counts as planned (TASK_UPDATE records them with slipWeeks).
 */
import { describe, it, expect } from 'vitest';
import { addWeeks, slipWeeks, withSlippedWeeks, PLAN_LATER } from '../task-planning';

// Wednesday 28 Oct 2026: this week starts Monday 26 Oct
const NOW = new Date(2026, 9, 28, 15, 30);

describe('addWeeks', () => {
  it('moves by whole weeks from the Monday of the week', () => {
    expect(addWeeks('2026-10-26', 1)).toBe('2026-11-02');
    expect(addWeeks('2026-10-28', -1)).toBe('2026-10-19');
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('is null for something that is not a date', () => {
    expect(addWeeks('later', 1)).toBeNull();
  });
});

describe('slipWeeks', () => {
  it('slips this week when a task moves from this week to next week', () => {
    expect(slipWeeks('2026-10-26', '2026-11-02', NOW)).toEqual(['2026-10-26']);
  });

  it('slips every week from a carried over week through this week, moving to later or unplanned', () => {
    expect(slipWeeks('2026-10-12', PLAN_LATER, NOW)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(slipWeeks('2026-10-12', undefined, NOW)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('stops at the week before the new week when that comes before this week', () => {
    // From two weeks ago to last week: only the week it left slipped
    expect(slipWeeks('2026-10-12', '2026-10-19', NOW)).toEqual(['2026-10-12']);
    // Carried over into this week: the weeks before it slipped, this week is planned again
    expect(slipWeeks('2026-10-12', '2026-10-26', NOW)).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('stops at this week when the new week is further out', () => {
    expect(slipWeeks('2026-10-19', '2026-11-16', NOW)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('slips nothing for an earlier or the same week, an unplanned task, or a week still to come', () => {
    expect(slipWeeks('2026-11-02', '2026-10-26', NOW)).toEqual([]);
    expect(slipWeeks('2026-10-26', '2026-10-28', NOW)).toEqual([]);
    expect(slipWeeks(undefined, '2026-11-02', NOW)).toEqual([]);
    expect(slipWeeks(PLAN_LATER, '2026-11-02', NOW)).toEqual([]);
    expect(slipWeeks('2026-11-02', PLAN_LATER, NOW)).toEqual([]);
    expect(slipWeeks('2026-11-02', '2026-11-09', NOW)).toEqual([]);
  });

  it('reads a planned date that is not a Monday as its week', () => {
    expect(slipWeeks('2026-10-29', '2026-11-04', NOW)).toEqual(['2026-10-26']);
  });
});

describe('withSlippedWeeks', () => {
  it('adds weeks once, sorted, and drops values that are not dates', () => {
    expect(withSlippedWeeks(['2026-10-26', 'nope'], ['2026-10-19', '2026-10-26'])).toEqual(['2026-10-19', '2026-10-26']);
    expect(withSlippedWeeks(undefined, ['2026-10-26'])).toEqual(['2026-10-26']);
  });
});
