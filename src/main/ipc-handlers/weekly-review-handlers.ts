/**
 * Weekly review handlers: list and save the app-wide weekly reviews (src/main/weekly-review-store.ts)
 */
import { handleIpc } from './ipc-registry';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, WeeklyReview } from '../../shared/types';
import { weeklyReviewStore } from '../weekly-review-store';
import { appLog } from '../app-logger';

export function registerWeeklyReviewHandlers(): void {
  handleIpc(IPC_CHANNELS.WEEKLY_REVIEW_LIST, async (): Promise<IPCResult<WeeklyReview[]>> => {
    try {
      return { success: true, data: await weeklyReviewStore.list() };
    } catch (error) {
      appLog.error('[WeeklyReview] Could not list the reviews:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  handleIpc(IPC_CHANNELS.WEEKLY_REVIEW_SAVE, async (_, review: WeeklyReview): Promise<IPCResult<WeeklyReview>> => {
    try {
      return { success: true, data: await weeklyReviewStore.save(review) };
    } catch (error) {
      appLog.error('[WeeklyReview] Could not save the review:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
