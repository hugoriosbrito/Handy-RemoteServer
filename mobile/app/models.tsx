import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useConnectionStore } from "@/stores/connectionStore";
import { api, type ModelSummary } from "@/api/client";

export default function ModelsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const queryClient = useQueryClient();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const query = useQuery({
    queryKey: ["models", token, baseUrl],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { models: [], activeModelId: null };
      return api.getModels(token, baseUrl ?? undefined);
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (modelId: string) => {
      if (!token) throw new Error("no token");
      return api.selectModel(token, modelId, baseUrl ?? undefined);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["models", token, baseUrl], data);
    },
  });

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const models = query.data?.models ?? [];

  const renderItem = ({ item }: { item: ModelSummary }) => {
    const disabled = !item.isDownloaded || selectMutation.isPending;
    return (
      <TouchableOpacity
        style={[styles.card, item.isActive && styles.cardActive]}
        activeOpacity={disabled ? 1 : 0.8}
        onPress={() => {
          if (item.isDownloaded && !item.isActive)
            selectMutation.mutate(item.id);
        }}
        disabled={disabled}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.desc} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          {item.isActive ? (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={colors.primary}
            />
          ) : item.isDownloaded ? (
            <Ionicons name="ellipse-outline" size={24} color={colors.midGray} />
          ) : (
            <Ionicons
              name="cloud-download-outline"
              size={22}
              color={colors.midGray}
            />
          )}
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{item.sizeMb} MB</Text>
          {item.supportsTranslation ? (
            <Text style={styles.metaBadge}>{t("models.translation")}</Text>
          ) : null}
          {item.supportsStreaming ? (
            <Text style={styles.metaBadge}>{t("models.streaming")}</Text>
          ) : null}
          {!item.isDownloaded ? (
            <Text style={styles.metaMuted}>{t("models.notDownloaded")}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
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

        <Text style={styles.title}>{t("models.title")}</Text>
        <Text style={styles.subtitle}>{t("models.subtitle")}</Text>

        {query.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : query.isError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{t("models.loadError")}</Text>
          </View>
        ) : (
          <FlatList
            data={models}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                refreshing={query.isFetching}
                onRefresh={onRefresh}
              />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t("models.empty")}</Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    backBtn: {
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
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
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: colors.error, fontSize: typography.sizes.md },
    emptyText: {
      color: colors.midGray,
      fontSize: typography.sizes.md,
      textAlign: "center",
      marginTop: spacing.xl,
    },
    list: { paddingBottom: spacing.xxl },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 2,
      borderColor: "transparent",
      ...shadows.card,
    },
    cardActive: {
      borderColor: colors.primary,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    cardInfo: { flex: 1, marginRight: spacing.md },
    name: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    desc: {
      marginTop: 2,
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      lineHeight: 20,
    },
    cardMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    metaText: {
      fontSize: typography.sizes.xs,
      color: colors.textSecondary,
      fontWeight: typography.weights.medium,
    },
    metaBadge: {
      fontSize: typography.sizes.xs,
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    metaMuted: {
      fontSize: typography.sizes.xs,
      color: colors.midGray,
    },
  });
