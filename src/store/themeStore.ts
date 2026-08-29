import { create } from 'zustand';

const THEME_KEY = 'afa-theme';

const getInitialDark = (): boolean => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored !== null) return stored === 'dark';
  } catch {}
  return false;
};

const applyDark = (dark: boolean) => {
  document.documentElement.classList.toggle('dark', dark);
};

const persist = (dark: boolean) => {
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  } catch {}
};

interface ThemeStore {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: (() => {
    const dark = getInitialDark();
    applyDark(dark);
    return dark;
  })(),
  toggle: () =>
    set((state) => {
      const next = !state.isDark;
      applyDark(next);
      persist(next);
      return { isDark: next };
    }),
  setDark: (dark) => {
    applyDark(dark);
    persist(dark);
    set({ isDark: dark });
  },
}));
