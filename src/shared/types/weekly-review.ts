/**
 * The weekly review (src/shared/utils/weekly-review.ts): how a week went, saved app-wide in the
 * app's data folder, one review per week
 */

/** A 1 to 5 rating: Overall from Rough to Great, Energy from Empty to High */
export type WeeklyReviewRating = 1 | 2 | 3 | 4 | 5;

/** The week's figures when the review was saved */
export interface WeeklyReviewStats {
  /** Tasks finished in the week */
  done: number;
  /** Tasks planned for the week */
  planned: number;
  /** Planned tasks finished in the week */
  plannedDone: number;
  /** Tasks finished in the week that weren't planned for it */
  unplanned: number;
  /** Planned tasks not finished in the week */
  carried: number;
  focusSeconds: number;
  /** Focus sessions started in the week */
  sessions: number;
  /** Hard deadlines in the week that passed before the task was finished */
  hardMissed: number;
}

export interface WeeklyReview {
  /** The week's Monday, `YYYY-MM-DD` */
  weekStart: string;
  overall?: WeeklyReviewRating;
  energy?: WeeklyReviewRating;
  wentWell: string;
  gotInTheWay: string;
  tryNext: string;
  stats: WeeklyReviewStats;
  /** ISO time it was last saved */
  savedAt: string;
}
