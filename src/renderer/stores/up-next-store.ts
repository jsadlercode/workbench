import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UpNextState {
  /** The board's Up next bar is folded to one line */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

/** The board's Up next bar preferences, kept in localStorage like the board's task order */
export const useUpNextStore = create<UpNextState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed })
    }),
    {
      name: 'kanban-up-next',
      partialize: (state) => ({ collapsed: state.collapsed })
    }
  )
);
