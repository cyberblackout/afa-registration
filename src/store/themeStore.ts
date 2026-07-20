import { create } from 'zustand';

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: false,
  toggle: () =>
    set((state) => {
      document.documentElement.classList.toggle('dark', !state.isDark);
      return { isDark: !state.isDark };
    }),
  setDark: (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    set({ isDark: dark });
  },
}));
