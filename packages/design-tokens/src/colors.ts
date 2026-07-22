/**
 * Color tokens aligned with `src/styles/theme.css`.
 * Each themed color is defined once as a light/dark pair.
 */
export const colors = {
  light: {
    text: "#0f0f0f",
    background: "#fbfbfb",
    logoPrimary: "#faa2ca",
    logoStroke: "#382731",
  },
  dark: {
    text: "#fbfbfb",
    background: "#2c2b29",
    logoPrimary: "#f28cbb",
    logoStroke: "#fad1ed",
  },
  shared: {
    backgroundUi: "#da5893",
    textStroke: "#f6f6f6",
    midGray: "#808080",
  },
} as const;

export type ThemeMode = "light" | "dark";

export type ThemePalette = (typeof colors)[ThemeMode];
export type SharedColors = (typeof colors)["shared"];
export type ThemeColors = ThemePalette & SharedColors;

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return { ...colors[mode], ...colors.shared };
}
