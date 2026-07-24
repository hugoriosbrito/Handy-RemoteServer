import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Audio } from "expo-av";
import { Button, ActionSheet } from "@/components/ui";
import {
  spacing,
  typography,
  radius,
  shadows,
  type ThemeColors,
} from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useRecordingStore, formatDuration } from "@/stores/recordingStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { api } from "@/api/client";

/** Turn a model id / file path into a friendly label. */
function cleanModelName(raw?: string | null): string {
  if (!raw) return "Whisper";
  const seg = raw.split(/[\\/]/).pop() ?? raw;
  return (
    seg
      .replace(/\.(gguf|bin|onnx|pt|safetensors)$/i, "")
      .replace(/[-_]q\d+(_\d+)?$/i, "")
      .trim() || raw
  );
}

export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const lastTranscription = useRecordingStore((s) => s.lastTranscription);
  const lastAudioUri = useRecordingStore((s) => s.lastAudioUri);
  const lastModel = useRecordingStore((s) => s.lastModel);
  const lastPostProcessed = useRecordingStore((s) => s.lastPostProcessed);
  const lastId = useRecordingStore((s) => s.lastId);
  const lastDurationMs = useRecordingStore((s) => s.lastDurationMs);
  const updateResult = useRecordingStore((s) => s.updateResult);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);

  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(lastDurationMs || 0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState<null | "retranscribe" | "reprocess">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const text = lastTranscription ?? "";

  // Map the raw model id to the friendly name the models list exposes.
  const modelsQuery = useQuery({
    queryKey: ["models", token, baseUrl],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { models: [], activeModelId: null };
      return api.getModels(token, baseUrl ?? undefined);
    },
  });
  const modelName = useMemo(() => {
    const match = modelsQuery.data?.models.find((m) => m.id === lastModel);
    return match?.name ?? cleanModelName(lastModel);
  }, [modelsQuery.data, lastModel]);

  const meta = useMemo(
    () =>
      t("result.meta", {
        duration: formatDuration(durationMs),
        model: modelName,
        processing: lastPostProcessed
          ? t("result.processingPP")
          : t("result.processingRaw"),
      }),
    [durationMs, modelName, lastPostProcessed, t],
  );

  // Playback can stream from the PC (works for streaming recordings and history)
  // or fall back to a full local file when one exists.
  const canPlay = Boolean((lastId && token) || lastAudioUri);

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["history"] });
  }, [queryClient, text]);

  // Unload the sound when leaving the screen.
  useEffect(() => {
    return () => {
      const snd = soundRef.current;
      soundRef.current = null;
      if (snd) void snd.unloadAsync().catch(() => undefined);
    };
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (!text) return;
    await Share.share({ message: text });
  };

  const togglePlay = async () => {
    if (!canPlay) return;
    try {
      const existing = soundRef.current;
      if (playing && existing) {
        await existing.pauseAsync();
        setPlaying(false);
        return;
      }
      if (existing) {
        await existing.playAsync();
        setPlaying(true);
        return;
      }

      setLoadingAudio(true);
      // The recorder leaves the audio session in "record" mode — switch back to
      // playback or nothing comes out of the speaker.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const source =
        lastId && token
          ? {
              uri: api.transcriptionAudioUrl(lastId, baseUrl ?? undefined),
              headers: { Authorization: `Bearer ${token}` },
            }
          : { uri: lastAudioUri as string };

      const { sound } = await Audio.Sound.createAsync(source, {
        shouldPlay: true,
      });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPositionMs(status.positionMillis ?? 0);
        if (status.durationMillis) setDurationMs(status.durationMillis);
        if (status.didJustFinish) {
          setPlaying(false);
          setPositionMs(0);
          void sound.setPositionAsync(0);
        }
      });
    } catch {
      setActionError(t("result.playbackFailed"));
    } finally {
      setLoadingAudio(false);
    }
  };

  const runAction = async (action: "retranscribe" | "reprocess") => {
    setMoreOpen(false);
    if (!lastId || !token) {
      setActionError(t("result.noServerEntry"));
      return;
    }
    setActionError(null);
    setBusy(action);
    try {
      const result =
        action === "retranscribe"
          ? await api.retranscribe(token, lastId, baseUrl ?? undefined)
          : await api.reprocess(token, lastId, baseUrl ?? undefined);
      updateResult({
        text: result.finalText || result.rawText,
        model: result.model ?? lastModel,
        postProcessed: result.postProcessed,
      });
      void queryClient.invalidateQueries({ queryKey: ["history"] });
    } catch {
      setActionError(t("result.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const progress =
    durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else router.replace("/(tabs)");
            }}
            accessibilityLabel={t("common.back")}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t("result.title")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>

        {lastTranscription == null ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={colors.midGray}
            />
            <Text style={styles.emptyText}>{t("result.empty")}</Text>
          </View>
        ) : (
          <View style={styles.textCard}>
            <ScrollView
              style={styles.textScroll}
              contentContainerStyle={styles.textScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text style={styles.transcription}>
                {text.trim() ? text : t("result.empty")}
              </Text>
            </ScrollView>
            {busy ? (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.busyText}>
                  {busy === "retranscribe"
                    ? t("result.retranscribing")
                    : t("result.reprocessing")}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleCopy()}
            accessibilityLabel={copied ? t("result.copied") : t("common.copy")}
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>
              {copied ? t("result.copied") : t("common.copy")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleShare()}
            accessibilityLabel={t("common.share")}
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{t("common.share")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setMoreOpen(true)}
            disabled={Boolean(busy)}
            accessibilityLabel={t("common.more")}
            accessibilityRole="button"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.actionLabel}>{t("common.more")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.playerCard}>
          <Text style={styles.audioLabel}>{t("result.audio")}</Text>
          <View style={styles.playerRow}>
            <TouchableOpacity
              style={[styles.playBtn, !canPlay && styles.playDisabled]}
              onPress={() => void togglePlay()}
              disabled={!canPlay || loadingAudio}
            >
              {loadingAudio ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons
                  name={playing ? "pause" : "play"}
                  size={24}
                  color={colors.white}
                />
              )}
            </TouchableOpacity>
            <View style={styles.playerTrack}>
              <View
                style={[styles.playerProgress, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.playerTime}>
              {formatDuration(
                playing || positionMs > 0 ? positionMs : durationMs,
              )}
            </Text>
          </View>
          <Text style={styles.expires}>
            {canPlay ? t("result.expiresIn") : t("result.noAudio")}
          </Text>
        </View>

        <Button
          title={t("result.recordAgain")}
          onPress={() => router.replace("/recording")}
          style={styles.recordAgain}
        />
      </View>

      <ActionSheet
        visible={moreOpen}
        title={t("common.more")}
        cancelLabel={t("common.cancel")}
        onClose={() => setMoreOpen(false)}
        options={[
          {
            label: t("result.retranscribe"),
            icon: "refresh-outline",
            onPress: () => void runAction("retranscribe"),
          },
          {
            label: t("result.reprocess"),
            icon: "sparkles-outline",
            onPress: () => void runAction("reprocess"),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    container: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    meta: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginBottom: spacing.md,
    },
    textCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    textScroll: { flex: 1 },
    textScrollContent: { paddingBottom: spacing.xs },
    emptyCard: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    emptyText: {
      fontSize: typography.sizes.md,
      color: colors.midGray,
      textAlign: "center",
    },
    transcription: {
      fontSize: typography.sizes.md,
      color: colors.text,
      lineHeight: 26,
    },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface + "E6",
      borderRadius: radius.lg,
    },
    busyText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
    actionError: {
      color: colors.error,
      fontSize: typography.sizes.sm,
      marginBottom: spacing.sm,
    },
    actionRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: spacing.md,
    },
    actionBtn: {
      alignItems: "center",
      gap: spacing.xs,
      padding: spacing.sm,
    },
    actionLabel: {
      fontSize: typography.sizes.xs,
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    playerCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      ...shadows.card,
    },
    audioLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    playerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    playBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    playDisabled: { opacity: 0.4 },
    playerTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: "hidden",
    },
    playerProgress: {
      height: "100%",
      backgroundColor: colors.primary,
    },
    playerTime: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      fontVariant: ["tabular-nums"],
    },
    expires: {
      marginTop: spacing.sm,
      fontSize: typography.sizes.xs,
      color: colors.midGray,
    },
    recordAgain: {
      marginBottom: spacing.xl,
    },
  });
