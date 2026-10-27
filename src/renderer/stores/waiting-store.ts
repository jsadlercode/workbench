import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WaitingBarState {
  /** The board's Waiting on bar is folded to one line */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

/** The board's Waiting on bar preferences, kept in localStorage like the Up next bar's */
export const useWaitingBarStore = create<WaitingBarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed })
    }),
    {
      name: 'kanban-waiting',
      partialize: (state) => ({ collapsed: state.collapsed })
    }
  )
);
