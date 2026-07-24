import { useMemo } from "react";
import { Switch, View, Text, StyleSheet } from "react-native";
import { typography, spacing, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

interface ToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  hint?: string;
}

export function Toggle({ value, onValueChange, label, hint }: ToggleProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.logoPrimary }}
        thumbColor={value ? colors.primary : colors.white}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
    },
    textCol: {
      flex: 1,
      marginRight: spacing.md,
    },
    label: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },
    hint: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginTop: spacing.xs,
    },
  });
