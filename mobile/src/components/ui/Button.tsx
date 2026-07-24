import { useMemo } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { radius, typography, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost" || variant === "secondary";
  const isDanger = variant === "danger";

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        isPrimary && styles.primary,
        isGhost && styles.ghost,
        isDanger && styles.danger,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.primary} />
      ) : (
        <Text
          style={[
            styles.text,
            isPrimary && styles.textPrimary,
            isGhost && styles.textGhost,
            isDanger && styles.textDanger,
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      width: "100%",
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 52,
    },
    primary: {
      backgroundColor: colors.primary,
    },
    ghost: {
      backgroundColor: "transparent",
    },
    danger: {
      backgroundColor: colors.codeBg,
      borderWidth: 1,
      borderColor: colors.error,
    },
    disabled: {
      opacity: 0.5,
    },
    text: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
    textPrimary: {
      color: colors.white,
    },
    textGhost: {
      color: colors.primary,
    },
    textDanger: {
      color: colors.error,
    },
  });
