import { create } from 'zustand';

interface AmountVisibilityStore {
  hidden: boolean;
  toggle: () => void;
}

export const useAmountVisibility = create<AmountVisibilityStore>((set) => ({
  hidden: false,
  toggle: () => set((state) => ({ hidden: !state.hidden })),
}));
