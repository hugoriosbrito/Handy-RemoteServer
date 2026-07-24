import { View, StyleSheet, ViewStyle } from "react-native";
import { radius, shadows, spacing, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useMemo, type PropsWithChildren } from "react";

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  variant?: "default" | "soft";
}

export function Card({ children, style, variant = "default" }: CardProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.card, variant === "soft" && styles.soft, style]}>
      {children as never}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    soft: {
      backgroundColor: colors.codeBg,
      borderColor: "transparent",
    },
  });
