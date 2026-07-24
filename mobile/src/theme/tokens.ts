// Light palette — values kept identical to the app's original static theme so
// light mode is byte-for-byte unchanged. `surface` mirrors the old `white`
// card background; `white` stays literal white for text/icons on the primary.
export const lightColors = {
  primary: "#da5893",
  primarySoft: "#FDF2F7",
  primaryMuted: "#F8D5E6",
  backgroundUi: "#da5893",
  logoPrimary: "#faa2ca",
  logoStroke: "#382731",
  text: "#0f0f0f",
  textSecondary: "#6B6B6B",
  background: "#FFFFFF",
  backgroundAlt: "#FAFAFA",
  surface: "#FFFFFF",
  // ~4.6:1 on #FAFAFA — meets WCAG AA for small text.
  midGray: "#6E6E6E",
  success: "#2F9E6A",
  warning: "#C56A18",
  warningSoft: "#FFF3E8",
  codeBg: "#FDF2F7",
  softPink: "#FDF2F7",
  white: "#FFFFFF",
  border: "#E8E8E8",
  borderStrong: "#E0E0E0",
  error: "#D64545",
  recording: "#E53935",
  overlay: "#1A1A1A",
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  primary: "#e56aa6",
  primarySoft: "#2A2028",
  primaryMuted: "#3A2A34",
  backgroundUi: "#da5893",
  logoPrimary: "#faa2ca",
  logoStroke: "#382731",
  text: "#F4F4F5",
  textSecondary: "#AFAFAF",
  background: "#161618",
  backgroundAlt: "#0F0F11",
  surface: "#1F1F22",
  // ~4.6:1 on #0F0F11.
  midGray: "#A3A3A3",
  success: "#3FB47D",
  warning: "#F0B06A",
  warningSoft: "#3A2E1E",
  codeBg: "#241C22",
  softPink: "#241C22",
  white: "#FFFFFF",
  border: "#2E2E32",
  borderStrong: "#3A3A40",
  error: "#EF5F5F",
  recording: "#FF5A52",
  overlay: "#000000",
};

/** Default export kept so any non-themed reference still resolves to light. */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  fontFamily: undefined as string | undefined,
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    title: 32,
  },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
