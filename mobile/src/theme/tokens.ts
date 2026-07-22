export const colors = {
  primary: '#da5893',
  backgroundUi: '#da5893',
  logoPrimary: '#faa2ca',
  logoStroke: '#382731',
  text: '#0f0f0f',
  textSecondary: '#808080',
  background: '#FFFFFF',
  backgroundAlt: '#fbfbfb',
  midGray: '#808080',
  success: '#2F9E6A',
  warning: '#E08A3A',
  codeBg: '#FDF2F7',
  softPink: '#FDF2F7',
  white: '#FFFFFF',
  border: '#E8E8E8',
  error: '#D64545',
} as const;

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
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
