import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ActionSheet } from "@/components/ui";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  spacing,
  typography,
  radius,
  shadows,
  type ThemeColors,
} from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import {
  useRecordingStore,
  formatDuration,
  formatBytes,
} from "@/stores/recordingStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { probeServerHealth, uploadWithRetry } from "@/lib/connection";
import { apiErrorCode } from "@/api/client";

export default function OfflineQueueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const offlineQueue = useRecordingStore((s) => s.offlineQueue);
  const updateQueueItem = useRecordingStore((s) => s.updateQueueItem);
  const removeFromOfflineQueue = useRecordingStore(
    (s) => s.removeFromOfflineQueue,
  );
  const setResult = useRecordingStore((s) => s.setResult);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const computer = useConnectionStore((s) => s.computer);
  const postProcessEnabled = useSettingsStore((s) => s.postProcessEnabled);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const totalBytes = offlineQueue.reduce(
    (sum, q) => sum + (q.sizeBytes ?? 0),
    0,
  );

  useEffect(() => {
    if (baseUrl) void probeServerHealth(baseUrl);
  }, [baseUrl]);

  const retryItem = async (id: string) => {
    const item = offlineQueue.find((q) => q.id === id);
    if (!item || !token) {
      router.push("/pair/scan");
      return;
    }
    setBusyId(id);
    updateQueueItem(id, { status: "uploading", error: undefined });
    try {
      const result = await uploadWithRetry(token, item.uri, {
        postProcess: postProcessEnabled,
        baseUrl: baseUrl ?? undefined,
        attempts: 3,
        recordingId: item.recordingId ?? item.id,
      });
      removeFromOfflineQueue(id);
      setResult({
        text: result.finalText || result.rawText,
        durationMs: item.durationMs,
        audioUri: item.uri,
        model: result.model,
        postProcessed: result.postProcessed,
      });
      void queryClient.invalidateQueries({ queryKey: ["history"] });
      router.replace("/result");
    } catch (e) {
      updateQueueItem(id, {
        status: "failed",
        errorCode: apiErrorCode(e) ?? undefined,
        error: e instanceof Error ? e.message : "failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>{t("offlineQueue.title")}</Text>
        <Text style={styles.subtitle}>{t("offlineQueue.subtitle")}</Text>

        {offlineQueue.length > 0 ? (
          <Text style={styles.pending}>
            {totalBytes > 0
              ? t("offlineQueue.pendingSize", {
                  count: offlineQueue.length,
                  size: formatBytes(totalBytes),
                })
              : t("offlineQueue.pendingCount", {
                  count: offlineQueue.length,
                })}
          </Text>
        ) : null}

        {computer && !computer.isOnline ? (
          <View style={styles.warn}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={styles.warnText}>
              {t("offlineQueue.computerOffline", { name: computer.name })}
            </Text>
          </View>
        ) : null}

        {offlineQueue.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="cloud-done-outline"
              size={48}
              color={colors.midGray}
            />
            <Text style={styles.emptyText}>{t("offlineQueue.empty")}</Text>
          </View>
        ) : (
          <FlatList
            data={offlineQueue}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <View style={styles.itemRow}>
                  <View style={styles.noteIcon}>
                    <Ionicons
                      name="musical-note"
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemDuration}>
                      {formatDuration(item.durationMs)}
                    </Text>
                    <Text style={styles.itemDate}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                  {busyId === item.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <View
                      style={[
                        styles.statusBadge,
                        item.status === "failed" && styles.statusFailed,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {t(`offlineQueue.status.${item.status}`)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.itemActions}>
                  <TouchableOpacity onPress={() => void retryItem(item.id)}>
                    <Text style={styles.retryText}>
                      {t("offlineQueue.retry")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setItemToDelete(item.id)}
                    accessibilityLabel={t("offlineQueue.deleteItem")}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
      <ActionSheet
        visible={itemToDelete !== null}
        title={t("offlineQueue.deleteTitle")}
        message={t("offlineQueue.deleteBody")}
        cancelLabel={t("common.cancel")}
        onClose={() => setItemToDelete(null)}
        options={[
          {
            label: t("common.delete"),
            icon: "trash-outline",
            destructive: true,
            onPress: () => {
              if (itemToDelete) removeFromOfflineQueue(itemToDelete);
              setItemToDelete(null);
            },
          },
        ]}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    backBtn: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      width: 40,
      height: 40,
      justifyContent: "center",
    },
    title: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.sizes.md,
      color: colors.midGray,
      marginTop: spacing.xs,
      marginBottom: spacing.md,
      lineHeight: 22,
    },
    pending: {
      fontSize: typography.sizes.sm,
      color: colors.warning,
      fontWeight: typography.weights.medium,
      marginBottom: spacing.md,
    },
    warn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    warnText: { flex: 1, color: colors.warning, fontSize: typography.sizes.sm },
    list: { paddingBottom: spacing.xl, gap: spacing.sm },
    item: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...shadows.card,
    },
    itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    noteIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.codeBg,
      alignItems: "center",
      justifyContent: "center",
    },
    itemInfo: { flex: 1 },
    itemDuration: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    itemDate: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginTop: 2,
    },
    statusBadge: {
      backgroundColor: colors.codeBg,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusFailed: { backgroundColor: "#FDECEC" },
    statusText: {
      fontSize: typography.sizes.xs,
      color: colors.primary,
      textTransform: "capitalize",
    },
    itemActions: {
      marginTop: spacing.md,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    retryText: {
      color: colors.primary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    emptyText: { color: colors.midGray, fontSize: typography.sizes.md },
  });
