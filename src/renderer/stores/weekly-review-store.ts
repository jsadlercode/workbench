/**
 * The weekly review page's data: every project's tasks (archived ones too), when each task was
 * finished (the projects' task history) and the saved reviews. Loaded once, the first time the
 * page opens in the app's session, and again only from the page's refresh button. Also holds the
 * reflection drafts per week, so a draft survives paging to another week and back.
 */
import { create } from 'zustand';
import type { Task, WeeklyReview, WeeklyReviewRating } from '../../shared/types';
import { doneTimesFromHistory, taskKey } from '../../shared/utils/weekly-review';

/** The reflection form's fields for one week */
export interface WeeklyReviewDraft {
  overall?: WeeklyReviewRating;
  energy?: WeeklyReviewRating;
  wentWell: string;
  gotInTheWay: string;
  tryNext: string;
}

export const EMPTY_REVIEW_DRAFT: WeeklyReviewDraft = { wentWell: '', gotInTheWay: '', tryNext: '' };

type WeeklyReviewLoadStatus = 'idle' | 'loading' | 'ready';

interface WeeklyReviewState {
  status: WeeklyReviewLoadStatus;
  /** Something didn't load (a project's tasks or history, or the reviews) */
  loadFailed: boolean;
  /** Every project's tasks, archived ones included, as last loaded */
  tasks: Task[];
  /** When tasks were finished (ms), by taskKey */
  doneTimes: Map<string, number>;
  /** Saved reviews by week (its Monday) */
  reviews: Record<string, WeeklyReview>;
  /** Unsaved reflection fields by week */
  drafts: Record<string, WeeklyReviewDraft>;

  /** Load everything for these projects (the refresh button, or the page's first open) */
  load: (projectIds: string[]) => Promise<void>;
  /** A task as the main process returned it after an update */
  replaceTask: (task: Task) => void;
  setDraft: (week: string, draft: WeeklyReviewDraft) => void;
  /** Save a week's review; resolves to whether it was saved */
  saveReview: (review: WeeklyReview) => Promise<boolean>;
}

let loading: Promise<void> | null = null;

export const useWeeklyReviewStore = create<WeeklyReviewState>((set, get) => ({
  status: 'idle',
  loadFailed: false,
  tasks: [],
  doneTimes: new Map(),
  reviews: {},
  drafts: {},

  load: (projectIds) => {
    // A refresh while loading waits for the load under way
    if (loading) return loading;
    set({ status: get().status === 'ready' ? 'ready' : 'loading' });
    loading = (async () => {
      let failed = false;
      const perProject = await Promise.all(
        projectIds.map(async (projectId) => {
          const [tasks, history] = await Promise.all([
            window.electronAPI.getTasks(projectId).catch(() => null),
            window.electronAPI.getTaskHistory(projectId).catch(() => null)
          ]);
          if (!tasks?.success || !history?.success) failed = true;
          return { projectId, tasks: tasks?.success ? tasks.data ?? [] : [], history: history?.success ? history.data ?? [] : [] };
        })
      );
      const reviewsResult = await window.electronAPI.getWeeklyReviews().catch(() => null);
      if (!reviewsResult?.success) failed = true;

      const doneTimes = new Map<string, number>();
      for (const { projectId, history } of perProject) doneTimesFromHistory(projectId, history, doneTimes);
      const reviews = reviewsResult?.success
        ? Object.fromEntries((reviewsResult.data ?? []).map((review) => [review.weekStart, review]))
        : get().reviews;

      set({
        status: 'ready',
        loadFailed: failed,
        tasks: perProject.flatMap((project) => project.tasks),
        doneTimes,
        reviews
      });
    })().finally(() => {
      loading = null;
    });
    return loading;
  },

  replaceTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (taskKey(t) === taskKey(task) ? { ...t, ...task } : t))
    })),

  setDraft: (week, draft) => set((state) => ({ drafts: { ...state.drafts, [week]: draft } })),

  saveReview: async (review) => {
    try {
      const result = await window.electronAPI.saveWeeklyReview(review);
      if (!result.success || !result.data) return false;
      const saved = result.data;
      set((state) => {
        const drafts = { ...state.drafts };
        delete drafts[saved.weekStart];
        return { reviews: { ...state.reviews, [saved.weekStart]: saved }, drafts };
      });
      return true;
    } catch {
      return false;
    }
  }
}));
