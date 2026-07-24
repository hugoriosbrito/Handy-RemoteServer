import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
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

type SortMode = "default" | "accuracy" | "speed";

const COMMON_FILTER_LANGS = [
  { code: "en", label: "English" },
  { code: "pt", label: "Portuguese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ru", label: "Russian" },
  { code: "ko", label: "Korean" },
];

function ScoreMeter({
  label,
  value,
  colors,
  styles,
}: {
  label: string;
  value: number;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View style={styles.scoreMeter}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${width}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

export default function ModelsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const queryClient = useQueryClient();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [languageModalOpen, setLanguageModalOpen] = useState(false);

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

  const availableLanguages = useMemo(() => {
    const codes = new Set<string>();
    for (const model of query.data?.models ?? []) {
      for (const lang of model.supportedLanguages ?? []) {
        codes.add(lang.toLowerCase());
      }
    }
    return COMMON_FILTER_LANGS.filter((lang) => codes.has(lang.code));
  }, [query.data?.models]);

  const models = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    const filtered = (query.data?.models ?? []).filter((model) => {
      if (queryText) {
        const haystack = `${model.name} ${model.description}`.toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }
      if (languageFilter !== "all") {
        const langs = (model.supportedLanguages ?? []).map((lang) => lang.toLowerCase());
        if (!(langs.includes("auto") || langs.includes(languageFilter))) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (sortMode === "accuracy") return (b.accuracyScore ?? 0) - (a.accuracyScore ?? 0);
      if (sortMode === "speed") return (b.speedScore ?? 0) - (a.speedScore ?? 0);
      if (a.isDownloaded !== b.isDownloaded) return a.isDownloaded ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [query.data?.models, search, languageFilter, sortMode]);

  const selectedLanguageLabel =
    languageFilter === "all"
      ? t("models.allLanguages")
      : COMMON_FILTER_LANGS.find((lang) => lang.code === languageFilter)?.label ?? languageFilter;

  const renderItem = ({ item }: { item: ModelSummary }) => {
    const disabled = !item.isDownloaded || selectMutation.isPending;
    const accuracy = item.accuracyScore ?? 0;
    const speed = item.speedScore ?? 0;
    return (
      <TouchableOpacity
        style={[styles.card, item.isActive && styles.cardActive]}
        activeOpacity={disabled ? 1 : 0.8}
        onPress={() => {
          if (item.isDownloaded && !item.isActive) selectMutation.mutate(item.id);
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
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
          ) : item.isDownloaded ? (
            <Ionicons name="ellipse-outline" size={24} color={colors.midGray} />
          ) : (
            <Ionicons name="cloud-download-outline" size={22} color={colors.midGray} />
          )}
        </View>

        {(accuracy > 0 || speed > 0) ? (
          <View style={styles.scoreRow}>
            {accuracy > 0 ? (
              <ScoreMeter label={t("models.accuracy")} value={accuracy} colors={colors} styles={styles} />
            ) : null}
            {speed > 0 ? (
              <ScoreMeter label={t("models.speed")} value={speed} colors={colors} styles={styles} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>{item.sizeMb} MB</Text>
          {(item.supportedLanguages?.length ?? 0) > 0 ? (
            <Text style={styles.metaBadge}>
              {item.supportedLanguages!.includes("auto")
                ? t("models.multilingual")
                : t("models.languageCount", { count: item.supportedLanguages!.length })}
            </Text>
          ) : null}
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

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("models.searchPlaceholder")}
          placeholderTextColor={colors.midGray}
          style={styles.searchInput}
        />

        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={styles.filterChip}
            onPress={() => setLanguageModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="globe-outline" size={16} color={colors.primary} />
            <Text style={styles.filterChipText}>{selectedLanguageLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, sortMode === "accuracy" && styles.filterChipActive]}
            onPress={() => setSortMode((prev) => (prev === "accuracy" ? "default" : "accuracy"))}
            activeOpacity={0.8}
          >
            <Text style={styles.filterChipText}>{t("models.sortAccuracy")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, sortMode === "speed" && styles.filterChipActive]}
            onPress={() => setSortMode((prev) => (prev === "speed" ? "default" : "speed"))}
            activeOpacity={0.8}
          >
            <Text style={styles.filterChipText}>{t("models.sortSpeed")}</Text>
          </TouchableOpacity>
        </View>

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
              <RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{t("models.empty")}</Text>
            }
          />
        )}
      </View>

      <Modal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLanguageModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t("models.filterLanguage")}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  setLanguageFilter("all");
                  setLanguageModalOpen(false);
                }}
              >
                <Text style={styles.modalItemText}>{t("models.allLanguages")}</Text>
                {languageFilter === "all" ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
              {availableLanguages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={styles.modalItem}
                  onPress={() => {
                    setLanguageFilter(lang.code);
                    setLanguageModalOpen(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{lang.label}</Text>
                  {languageFilter === lang.code ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    filtersRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    filterChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.codeBg,
    },
    filterChipText: {
      fontSize: typography.sizes.xs,
      color: colors.text,
      fontWeight: typography.weights.medium,
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
    scoreRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    scoreMeter: { flex: 1 },
    scoreLabel: {
      fontSize: typography.sizes.xs,
      color: colors.midGray,
      marginBottom: 4,
    },
    scoreTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    scoreFill: {
      height: 6,
      borderRadius: 999,
    },
    cardMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
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
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    modalTitle: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    modalItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    modalItemText: {
      fontSize: typography.sizes.md,
      color: colors.text,
    },
  });
