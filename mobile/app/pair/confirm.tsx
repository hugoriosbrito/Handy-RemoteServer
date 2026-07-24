import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui";
import { HandyLogo } from "@/components/HandyLogo";
import { spacing, typography, radius, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useConnectionStore } from "@/stores/connectionStore";
import { api } from "@/api/client";

const POLL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

export default function ConfirmPairScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pending = useConnectionStore((s) => s.pendingPairing);
  const connect = useConnectionStore((s) => s.connect);
  const setConnecting = useConnectionStore((s) => s.setConnecting);
  const isConnecting = useConnectionStore((s) => s.isConnecting);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const finishWithCredentials = async (
    accessToken: string,
    refreshToken: string,
    deviceId: string,
    serverName: string,
    baseUrl: string,
  ) => {
    stopPolling();
    await connect(
      accessToken,
      {
        id: deviceId,
        name: serverName,
        lastSeen: new Date().toISOString(),
        isOnline: true,
      },
      { refreshToken, baseUrl },
    );
    setConnecting(false);
    router.replace("/onboarding/microphone");
  };

  const handleAuthorize = async () => {
    if (!pending) {
      setError(t("pair.missingQr"));
      return;
    }

    setConnecting(true);
    setError(null);
    setStatusHint(t("pair.claiming"));

    try {
      const claim = await api.claimPairing(
        {
          sessionId: pending.sessionId,
          secret: pending.secret,
          deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
          platform: Platform.OS,
        },
        pending.baseUrl,
      );

      useConnectionStore.getState().setPendingPairing({
        ...pending,
        code: claim.code,
      });
      setStatusHint(t("pair.waitingApproval", { code: claim.code }));

      const startedAt = Date.now();
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            stopPolling();
            setConnecting(false);
            setError(t("pair.timeout"));
            return;
          }

          const status = await api.getPairingStatus(
            pending.sessionId,
            pending.baseUrl,
          );

          if (status.status === "approved" && status.credentials) {
            await finishWithCredentials(
              status.credentials.accessToken,
              status.credentials.refreshToken,
              status.credentials.deviceId,
              claim.serverName,
              pending.baseUrl,
            );
          } else if (status.status === "rejected") {
            stopPolling();
            setConnecting(false);
            setError(t("pair.rejected"));
          } else if (status.status === "expired") {
            stopPolling();
            setConnecting(false);
            setError(t("pair.expired"));
          }
        } catch (e) {
          console.warn("pairing poll failed", e);
        }
      }, POLL_MS);
    } catch (e) {
      setConnecting(false);
      setStatusHint(null);
      setError(e instanceof Error ? e.message : t("pair.failed"));
    }
  };

  useEffect(() => {
    if (!pending || startedRef.current) return;
    startedRef.current = true;
    void handleAuthorize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.sessionId]);

  const handleCancel = () => {
    stopPolling();
    setConnecting(false);
    router.back();
  };

  const displayCode =
    pending?.code || useConnectionStore.getState().pairingCode;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleCancel}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("pair.confirmTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <HandyLogo size={88} showWordmark={false} />
        <Text style={styles.heading}>{t("pair.confirmSubtitle")}</Text>
        <Text style={styles.body}>{t("pair.codeHint")}</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>{t("pair.pairingCode")}</Text>
          <Text style={styles.code}>{displayCode || "······"}</Text>
          {pending?.serverName ? (
            <Text style={styles.serverName}>{pending.serverName}</Text>
          ) : null}
        </View>

        {isConnecting && !error ? (
          <View style={styles.waitRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.waitText}>
              {statusHint ?? t("pair.waiting")}
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {pending?.baseUrl ? (
          <Text style={styles.endpointHint}>{pending.baseUrl}</Text>
        ) : null}

        <View style={styles.actions}>
          {!isConnecting ? (
            <Button
              title={t("pair.authorize")}
              onPress={() => void handleAuthorize()}
            />
          ) : null}
          <Button
            title={t("pair.cancel")}
            onPress={handleCancel}
            variant="ghost"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    headerTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    content: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
    },
    heading: {
      marginTop: spacing.lg,
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      textAlign: "center",
    },
    body: {
      marginTop: spacing.sm,
      fontSize: typography.sizes.md,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    codeCard: {
      width: "100%",
      marginTop: spacing.lg,
      backgroundColor: colors.codeBg,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      gap: spacing.sm,
    },
    codeLabel: {
      fontSize: typography.sizes.xs,
      color: colors.midGray,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    code: {
      fontSize: 36,
      fontWeight: typography.weights.bold,
      letterSpacing: 8,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    serverName: {
      fontSize: typography.sizes.sm,
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    waitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    waitText: {
      flex: 1,
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    error: {
      marginTop: spacing.md,
      color: colors.error,
      fontSize: typography.sizes.sm,
      textAlign: "center",
    },
    endpointHint: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.xs,
      color: colors.midGray,
      textAlign: "center",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    actions: {
      marginTop: "auto",
      width: "100%",
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
  });
