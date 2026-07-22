import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  variant?: 'default' | 'soft';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        variant === 'soft' && styles.soft,
        style,
      ]}
    >
      {children as never}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  soft: {
    backgroundColor: colors.codeBg,
    borderColor: 'transparent',
  },
});
