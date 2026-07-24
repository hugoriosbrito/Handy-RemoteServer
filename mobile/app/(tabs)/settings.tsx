import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import { Toggle, ActionSheet } from "@/components/ui";
import { HandyLogo } from "@/components/HandyLogo";
import {
  spacing,
  typography,
  radius,
  shadows,
  type ThemeColors,
} from "@/theme/tokens";
import { useTheme, useThemeInfo } from "@/theme/ThemeProvider";
import { useConnectionStore } from "@/stores/connectionStore";
import {
  useSettingsStore,
  type AudioRetentionHours,
} from "@/stores/settingsStore";
import { useRecordingStore } from "@/stores/recordingStore";
import i18n, { setStoredLanguage } from "@/i18n";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const disconnect = useConnectionStore((s) => s.disconnect);
  const computer = useConnectionStore((s) => s.computer);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const biometrics = useSettingsStore((s) => s.biometrics);
  const setBiometrics = useSettingsStore((s) => s.setBiometrics);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const audioRetentionHours = useSettingsStore((s) => s.audioRetentionHours);
  const setAudioRetention = useSettingsStore((s) => s.setAudioRetention);
  const { scheme } = useThemeInfo();
  const offlineCount = useRecordingStore((s) => s.offlineQueue.length);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const retentionLabel = (hours: AudioRetentionHours) => {
    switch (hours) {
      case 1:
        return t("settings.retention1h");
      case 168:
        return t("settings.retention7d");
      case -1:
        return t("settings.retentionNever");
      default:
        return t("settings.retention24h");
    }
  };

  const handleBiometricsToggle = async (next: boolean) => {
    if (!next) {
      setBiometricError(null);
      setBiometrics(false);
      return;
    }
    // Enabling: confirm the device can actually authenticate before persisting.
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      setBiometricError(t("settings.biometricsUnavailable"));
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t("biometricGate.prompt"),
      cancelLabel: t("common.cancel"),
    });
    if (result.success) {
      setBiometricError(null);
      setBiometrics(true);
    }
  };

  const toggleLanguage = async () => {
    const next = language === "pt-BR" ? "en" : "pt-BR";
    setLanguage(next);
    await setStoredLanguage(next);
    i18n.changeLanguage(next);
  };

  const handleDisconnect = async () => {
    await disconnect();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        <View style={styles.brandRow}>
          <HandyLogo size={48} />
        </View>
        <Text style={styles.title}>{t("settings.title")}</Text>

        <Text style={styles.sectionLabel}>{t("settings.onThisPhone")}</Text>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/computers")}
          >
            <Text style={styles.rowLabel}>{t("settings.computers")}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{computer?.name ?? "—"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.midGray}
              />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/offline-queue")}
          >
            <Text style={styles.rowLabel}>{t("settings.offlineQueue")}</Text>
            <View style={styles.rowRight}>
              {offlineCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{offlineCount}</Text>
                </View>
              ) : null}
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.midGray}
              />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => void toggleLanguage()}
          >
            <Text style={styles.rowLabel}>{t("settings.language")}</Text>
            <Text style={styles.rowValue}>
              {language === "pt-BR" ? t("settings.languageValue") : "English"}
            </Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => setRetentionOpen(true)}
          >
            <Text style={styles.rowLabel}>{t("settings.audioRetention")}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {retentionLabel(audioRetentionHours)}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.midGray}
              />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Toggle
              value={biometrics}
              onValueChange={(v) => void handleBiometricsToggle(v)}
              label={t("settings.biometrics")}
            />
            {biometricError ? (
              <Text style={styles.biometricError}>{biometricError}</Text>
            ) : null}
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Toggle
              value={scheme === "dark"}
              onValueChange={(v) => setThemeMode(v ? "dark" : "light")}
              label={t("settings.darkMode")}
            />
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => void Linking.openSettings()}
          >
            <Text style={styles.rowLabel}>{t("settings.microphone")}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {t("settings.microphoneHint")}
              </Text>
              <Ionicons name="open-outline" size={18} color={colors.midGray} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/diagnostics")}
          >
            <Text style={styles.rowLabel}>{t("settings.diagnostics")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.midGray} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("settings.about")}</Text>
            <Text style={styles.rowValue}>Handy Remote</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {t("settings.version", {
                version: Constants.expoConfig?.version ?? "0.1.0",
              })}
            </Text>
          </View>
        </View>

        {computer ? (
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => void handleDisconnect()}
          >
            <Text style={styles.disconnectText}>
              {t("settings.disconnect")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <ActionSheet
        visible={retentionOpen}
        title={t("settings.audioRetentionTitle")}
        cancelLabel={t("common.cancel")}
        onClose={() => setRetentionOpen(false)}
        options={([1, 24, 168, -1] as AudioRetentionHours[]).map((hours) => ({
          label: retentionLabel(hours),
          icon:
            audioRetentionHours === hours
              ? "checkmark-circle"
              : "ellipse-outline",
          onPress: () => {
            setAudioRetention(hours);
            setRetentionOpen(false);
          },
        }))}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    scroll: { flex: 1 },
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    brandRow: { marginBottom: spacing.sm },
    title: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    sectionLabel: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      fontWeight: typography.weights.medium,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      paddingVertical: spacing.xs,
      ...shadows.card,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    toggleRow: {
      paddingHorizontal: spacing.md,
    },
    biometricError: {
      color: colors.error,
      fontSize: typography.sizes.sm,
      paddingBottom: spacing.sm,
    },
    rowLabel: {
      fontSize: typography.sizes.md,
      color: colors.text,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowValue: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: spacing.md,
    },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      minWidth: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    badgeText: {
      color: colors.white,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
    },
    disconnectBtn: {
      alignItems: "center",
      paddingVertical: spacing.lg,
    },
    disconnectText: {
      color: colors.error,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
  });
