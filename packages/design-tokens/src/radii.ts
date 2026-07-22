/** Border radius tokens used across Handy UI surfaces. */
export const radii = {
  xs: 2,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 24,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radii;
