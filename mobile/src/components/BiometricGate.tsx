import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { spacing, typography, radius, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRecordingStore } from "@/stores/recordingStore";

/** Only re-lock after the app was truly away — not for brief OS overlays. */
const BACKGROUND_LOCK_MS = 3000;

/**
 * Gates the app behind device biometrics when enabled.
 * Authenticate on cold start and when returning after a real leave.
 * Skips re-lock during active recording. Renders as an overlay so
 * navigation / recording state is never unmounted by the lock screen.
 */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const biometrics = useSettingsStore((s) => s.biometrics);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  // Stay unlocked until settings load — then lock once if biometrics is on.
  const [unlocked, setUnlocked] = useState(true);
  const authInFlight = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const promptedColdStart = useRef(false);

  const authenticate = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("biometricGate.prompt"),
        cancelLabel: t("common.cancel"),
        disableDeviceFallback: false,
      });
      if (result.success) setUnlocked(true);
    } catch {
      // Don't brick the app if the OS auth sheet fails.
      setUnlocked(true);
    } finally {
      authInFlight.current = false;
    }
  }, [t]);

  // Cold start once settings are ready.
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!biometrics) {
      setUnlocked(true);
      return;
    }
    if (!promptedColdStart.current) {
      promptedColdStart.current = true;
      setUnlocked(false);
      void authenticate();
    }
  }, [settingsLoaded, biometrics, authenticate]);

  // When biometrics are turned off, unlock immediately.
  useEffect(() => {
    if (!biometrics) {
      promptedColdStart.current = false;
      setUnlocked(true);
    }
  }, [biometrics]);

  // Re-lock only after a sustained background stay, and never during recording.
  useEffect(() => {
    if (!biometrics) return;

    const onChange = (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;

      // Only count real background (leaving the app). "inactive" covers
      // permission sheets, share sheets, and the biometric prompt itself.
      if (next === "background") {
        backgroundedAt.current = Date.now();
        return;
      }

      if (next === "active" && prev === "background") {
        const recordingStatus = useRecordingStore.getState().status;
        const awayMs =
          backgroundedAt.current != null
            ? Date.now() - backgroundedAt.current
            : 0;
        backgroundedAt.current = null;

        if (
          recordingStatus === "recording" ||
          recordingStatus === "paused" ||
          recordingStatus === "processing"
        ) {
          return;
        }

        if (awayMs < BACKGROUND_LOCK_MS) {
          return;
        }

        setUnlocked(false);
        void authenticate();
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [biometrics, authenticate]);

  const showLock = biometrics && settingsLoaded && !unlocked;

  return (
    <View style={styles.root}>
      {children}
      {showLock ? (
        <View style={styles.lock} pointerEvents="auto">
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t("biometricGate.title")}</Text>
          <Text style={styles.subtitle}>{t("biometricGate.subtitle")}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => void authenticate()}
          >
            <Ionicons name="finger-print" size={22} color={colors.white} />
            <Text style={styles.buttonText}>{t("biometricGate.unlock")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    lock: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.md,
      zIndex: 1000,
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      textAlign: "center",
    },
    subtitle: {
      fontSize: typography.sizes.md,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
    },
    buttonText: {
      color: colors.white,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
  });
