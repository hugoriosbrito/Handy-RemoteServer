import { createContext, useContext, useMemo } from 'react';
import { lightColors, darkColors, type ThemeColors } from './tokens';
import { useSettingsStore, type ThemeMode } from '@/stores/settingsStore';

interface ThemeValue {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeValue>({
  colors: lightColors,
  scheme: 'light',
  mode: 'light',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSettingsStore((s) => s.themeMode);

  const value = useMemo<ThemeValue>(() => {
    // Only honor explicit light/dark. Legacy "system" falls back to light.
    const scheme: 'light' | 'dark' = mode === 'dark' ? 'dark' : 'light';
    return {
      colors: scheme === 'dark' ? darkColors : lightColors,
      scheme,
      mode,
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the active theme's color palette. */
export function useTheme(): ThemeColors {
  return useContext(ThemeContext).colors;
}

/** Returns the resolved scheme + mode plus the palette, for status bars etc. */
export function useThemeInfo(): ThemeValue {
  return useContext(ThemeContext);
}
