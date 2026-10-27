/**
 * Weekly reviews in the app's data folder: one per week keyed by its Monday, saved over the
 * week's earlier review, written atomically, checked on the way in and on the way out.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import type { WeeklyReview } from '../../shared/types';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../app-logger', () => ({ appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { WeeklyReviewStore, normalizeWeeklyReview } from '../weekly-review-store';

const STATS = { done: 3, planned: 4, plannedDone: 2, unplanned: 1, carried: 2, focusSeconds: 3600, sessions: 2, hardMissed: 0 };

function review(weekStart: string, overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    weekStart,
    overall: 4,
    energy: 3,
    wentWell: 'Shipped the review page',
    gotInTheWay: 'Meetings',
    tryNext: 'Plan on Monday',
    stats: STATS,
    savedAt: '2026-10-25T18:00:00.000Z',
    ...overrides
  };
}

let tmp: string;
let file: string;
let store: WeeklyReviewStore;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'weekly-reviews-'));
  file = path.join(tmp, 'store', 'weekly-reviews.json');
  store = new WeeklyReviewStore(() => file);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('WeeklyReviewStore', () => {
  it('lists nothing before anything was saved', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('saves a review keyed by its week, stamped with the time it was saved', async () => {
    const before = Date.now();
    const saved = await store.save(review('2026-10-19'));
    expect(Date.parse(saved.savedAt)).toBeGreaterThanOrEqual(before);
    expect({ ...saved, savedAt: '' }).toEqual({ ...review('2026-10-19'), savedAt: '' });

    const onDisk = JSON.parse(readFileSync(file, 'utf-8'));
    expect(onDisk.version).toBe(1);
    expect(Object.keys(onDisk.reviews)).toEqual(['2026-10-19']);
    // No temp file left behind
    expect(readdirSync(path.dirname(file))).toEqual(['weekly-reviews.json']);
  });

  it("replaces the week's earlier review and keeps the other weeks, oldest week first", async () => {
    await store.save(review('2026-10-26'));
    await store.save(review('2026-10-12'));
    await store.save(review('2026-10-26', { overall: 2, wentWell: 'Updated' }));

    const reviews = await store.list();
    expect(reviews.map((r) => r.weekStart)).toEqual(['2026-10-12', '2026-10-26']);
    expect(reviews[1]).toMatchObject({ overall: 2, wentWell: 'Updated' });
  });

  it('runs saves one after another, so none is lost', async () => {
    await Promise.all(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'].map((week) => store.save(review(week))));
    expect((await store.list()).map((r) => r.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  });

  it('refuses something that is not a review of a week', async () => {
    await expect(store.save({ ...review('2026-10-20') })).rejects.toThrow();
    await expect(store.save(null)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });

  it('reads an unreadable file as no reviews, and skips entries that are not reviews', async () => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{ not json');
    expect(await store.list()).toEqual([]);

    writeFileSync(file, JSON.stringify({ version: 1, reviews: { a: { weekStart: 'nope' }, b: review('2026-10-19') } }));
    expect((await store.list()).map((r) => r.weekStart)).toEqual(['2026-10-19']);
  });
});

describe('normalizeWeeklyReview', () => {
  it('drops ratings out of range, fills missing text and figures, and rounds the figures', () => {
    const normalized = normalizeWeeklyReview({
      weekStart: '2026-10-19',
      overall: 7,
      energy: 2,
      wentWell: 42,
      stats: { done: 2.6, planned: -1, focusSeconds: 'x' },
      savedAt: '2026-10-25T18:00:00.000Z'
    });
    expect(normalized).toEqual({
      weekStart: '2026-10-19',
      energy: 2,
      wentWell: '',
      gotInTheWay: '',
      tryNext: '',
      stats: { done: 3, planned: 0, plannedDone: 0, unplanned: 0, carried: 0, focusSeconds: 0, sessions: 0, hardMissed: 0 },
      savedAt: '2026-10-25T18:00:00.000Z'
    });
  });

  it('only takes a Monday as the week', () => {
    expect(normalizeWeeklyReview(review('2026-10-21'))).toBeNull();
    expect(normalizeWeeklyReview(review('2026-02-30'))).toBeNull();
  });
});
