/**
 * Weekly reviews: one per week, app-wide (every project's tasks are in the same review), kept in
 * `<userData>/store/weekly-reviews.json` keyed by the week's Monday. Reads and writes are async,
 * the file is written atomically (a temp file renamed over it), and saves happen one at a time.
 */
import { app } from 'electron';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import type { WeeklyReview, WeeklyReviewRating, WeeklyReviewStats } from '../shared/types';
import { parseDateKey, weekStart } from '../shared/utils/task-planning';
import { appLog } from './app-logger';

const FILE_VERSION = 1;
/** Longest text kept per reflection field */
const MAX_TEXT_LENGTH = 10_000;

interface WeeklyReviewFile {
  version: number;
  reviews: Record<string, WeeklyReview>;
}

const STAT_KEYS: (keyof WeeklyReviewStats)[] = [
  'done',
  'planned',
  'plannedDone',
  'unplanned',
  'carried',
  'focusSeconds',
  'sessions',
  'hardMissed'
];

function isRating(value: unknown): value is WeeklyReviewRating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '';
}

/**
 * A review as it is kept: a real Monday, ratings from 1 to 5, text fields as strings and the
 * figures as whole numbers of 0 or more. Null when it isn't a review at all.
 */
export function normalizeWeeklyReview(value: unknown): WeeklyReview | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const monday = typeof raw.weekStart === 'string' ? parseDateKey(raw.weekStart) : null;
  if (!monday || weekStart(monday) !== raw.weekStart) return null;
  const rawStats = raw.stats && typeof raw.stats === 'object' ? (raw.stats as Record<string, unknown>) : {};
  const stats = Object.fromEntries(
    STAT_KEYS.map((key) => {
      const n = rawStats[key];
      return [key, typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0];
    })
  ) as unknown as WeeklyReviewStats;
  const savedAt = typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : new Date().toISOString();
  const review: WeeklyReview = {
    weekStart: raw.weekStart as string,
    wentWell: text(raw.wentWell),
    gotInTheWay: text(raw.gotInTheWay),
    tryNext: text(raw.tryNext),
    stats,
    savedAt
  };
  if (isRating(raw.overall)) review.overall = raw.overall;
  if (isRating(raw.energy)) review.energy = raw.energy;
  return review;
}

export class WeeklyReviewStore {
  /** Saves (and the reads they start from) run one after another */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly getFile: () => string) {}

  private async read(): Promise<Record<string, WeeklyReview>> {
    let content: string;
    try {
      content = await readFile(this.getFile(), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        appLog.error('[WeeklyReviewStore] Could not read the weekly reviews:', error);
      }
      return {};
    }
    try {
      const parsed = JSON.parse(content) as Partial<WeeklyReviewFile>;
      const reviews: Record<string, WeeklyReview> = {};
      for (const value of Object.values(parsed?.reviews ?? {})) {
        const review = normalizeWeeklyReview(value);
        if (review) reviews[review.weekStart] = review;
      }
      return reviews;
    } catch (error) {
      appLog.error('[WeeklyReviewStore] The weekly reviews file is not valid JSON:', error);
      return {};
    }
  }

  private async write(reviews: Record<string, WeeklyReview>): Promise<void> {
    const file = this.getFile();
    await mkdir(path.dirname(file), { recursive: true });
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.tmp.${randomBytes(8).toString('hex')}`);
    const data: WeeklyReviewFile = { version: FILE_VERSION, reviews };
    try {
      await writeFile(temp, JSON.stringify(data, null, 2), 'utf-8');
      await rename(temp, file);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Every saved review, oldest week first */
  list(): Promise<WeeklyReview[]> {
    return this.enqueue(async () => {
      const reviews = await this.read();
      return Object.values(reviews).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
    });
  }

  /** Save a week's review over the one it had, stamped with the time; resolves to the review as kept */
  save(value: unknown): Promise<WeeklyReview> {
    return this.enqueue(async () => {
      const normalized = normalizeWeeklyReview(value);
      if (!normalized) throw new Error('Not a weekly review');
      const review: WeeklyReview = { ...normalized, savedAt: new Date().toISOString() };
      const reviews = await this.read();
      reviews[review.weekStart] = review;
      await this.write(reviews);
      return review;
    });
  }
}

export const weeklyReviewStore = new WeeklyReviewStore(() =>
  path.join(app.getPath('userData'), 'store', 'weekly-reviews.json')
);
