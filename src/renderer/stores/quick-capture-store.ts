import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanChoice } from '../../shared/utils/task-planning';

/** The weeks the board's capture bar offers */
export type CaptureWhen = Exclude<PlanChoice, 'unplanned'>;

export const CAPTURE_CHOICES: readonly CaptureWhen[] = ['this_week', 'next_week', 'later'];

const isCaptureWhen = (value: unknown): value is CaptureWhen =>
  CAPTURE_CHOICES.includes(value as CaptureWhen);

interface QuickCaptureState {
  /** The week last picked in the capture bar (This week until the user picks another) */
  when: CaptureWhen;
  setWhen: (when: CaptureWhen) => void;
}

/** The board's capture bar preferences, app-wide in localStorage like the Up next bar's */
export const useQuickCaptureStore = create<QuickCaptureState>()(
  persist(
    (set) => ({
      when: 'this_week',
      setWhen: (when) => set({ when })
    }),
    {
      name: 'kanban-quick-capture',
      partialize: (state) => ({ when: state.when }),
      // A stored value the bar doesn't offer keeps This week
      merge: (persisted, current) => {
        const when = (persisted as Partial<QuickCaptureState> | undefined)?.when;
        return isCaptureWhen(when) ? { ...current, when } : current;
      }
    }
  )
);
