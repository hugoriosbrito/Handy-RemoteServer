import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { typography, spacing, radius, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

interface DeviceCardProps {
  name: string;
  subtitle?: string;
  isOnline?: boolean;
  code?: string;
}

export function DeviceCard({
  name,
  subtitle,
  isOnline,
  code,
}: DeviceCardProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="desktop-outline" size={28} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {isOnline !== undefined && (
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  isOnline ? styles.dotOnline : styles.dotOffline,
                ]}
              />
              <Text style={styles.status}>
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
          )}
        </View>
      </View>
      {code && (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Código</Text>
          <Text style={styles.code}>{code}</Text>
        </View>
      )}
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginVertical: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.codeBg,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginTop: 2,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.xs,
    },
    dotOnline: {
      backgroundColor: colors.success,
    },
    dotOffline: {
      backgroundColor: colors.midGray,
    },
    status: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
    },
    codeBox: {
      marginTop: spacing.md,
      backgroundColor: colors.codeBg,
      borderRadius: radius.md,
      padding: spacing.md,
      alignItems: "center",
    },
    codeLabel: {
      fontSize: typography.sizes.xs,
      color: colors.midGray,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    code: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.primary,
      letterSpacing: 8,
    },
  });
