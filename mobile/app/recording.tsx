import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Audio } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
  Platform,
  Linking,
  type AppStateStatus,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Waveform } from "@/components/ui";
import { ActionSheet } from "@/components/ui";
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
import { useSettingsStore } from "@/stores/settingsStore";
import { api, apiErrorCode } from "@/api/client";
import { uploadWithRetry, probeServerHealth } from "@/lib/connection";
import { RemoteStreamingSession } from "@/lib/remoteStreaming";
import { RecordingSession } from "@/lib/recordingSession";
import * as FileSystem from "expo-file-system";
import {
  startBackgroundRecording,
  stopBackgroundRecording,
  isBackgroundRecordingActive,
} from "@/lib/backgroundRecording";
import {
  loadDesktopFeedbackSettings,
  playFeedbackSound,
} from "@/lib/soundFeedback";

/** How often to rotate + upload a chunk when the active model supports streaming. */
const STREAM_CHUNK_MS = 4000;
const mobileRecordingSession = new RecordingSession<Audio.Recording>();

export default function RecordingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useRecordingStore((s) => s.status);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const setStatus = useRecordingStore((s) => s.setStatus);
  const setElapsed = useRecordingStore((s) => s.setElapsed);
  const setResult = useRecordingStore((s) => s.setResult);
  const resetSession = useRecordingStore((s) => s.resetSession);
  const addToOfflineQueue = useRecordingStore((s) => s.addToOfflineQueue);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const computer = useConnectionStore((s) => s.computer);
  const postProcessEnabled = useSettingsStore((s) => s.postProcessEnabled);

  const modelsQuery = useQuery({
    queryKey: ["models", token, baseUrl],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { models: [], activeModelId: null };
      return api.getModels(token, baseUrl ?? undefined);
    },
  });
  const activeModel = modelsQuery.data?.models.find((m) => m.isActive);
  const streamingEnabled = Boolean(activeModel?.supportsStreaming && token);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamSessionRef = useRef<RemoteStreamingSession | null>(null);
  const streamedChunkUrisRef = useRef<string[]>([]);
  const streamingActiveRef = useRef(false);
  const rotatingChunkRef = useRef(false);
  const startTimeRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const liveTextRef = useRef("");
  const finishingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [meter, setMeter] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const clearStreamingTimer = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      if (useRecordingStore.getState().status === "recording") {
        setElapsed(
          pausedAccumRef.current + (Date.now() - startTimeRef.current),
        );
      }
    }, 200);
  };

  const prepareAndStartRecording = async (): Promise<Audio.Recording> => {
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    await recording.startAsync();
    return recording;
  };
  const bindMetering = (recording: Audio.Recording) => {
    try {
      recording.setProgressUpdateInterval(100);
      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording || status.metering == null) return;
        const linear = Math.max(0, Math.min(1, (status.metering + 60) / 60));
        setMeter(linear);
      });
    } catch {
      // metering may not be available on every device
    }
  };

  const setLivePreview = (committed: string, tentative: string) => {
    const combined = `${committed} ${tentative}`.replace(/\s+/g, " ").trim();
    liveTextRef.current = combined;
    setLiveText(combined);
  };

  const rotateStreamingChunk = async () => {
    if (rotatingChunkRef.current || !streamingActiveRef.current) return;
    const session = streamSessionRef.current;
    const recording = recordingRef.current;
    if (!session || !recording) return;
    rotatingChunkRef.current = true;
    try {
      await mobileRecordingSession.stop(recording);
      const chunkUri = recording.getURI();
      const nextRecording = await mobileRecordingSession.prepare(
        prepareAndStartRecording,
      );
      bindMetering(nextRecording);
      recordingRef.current = nextRecording;
      if (chunkUri) {
        streamedChunkUrisRef.current.push(chunkUri);
        await session.sendAudioFile(chunkUri);
      }
    } catch (streamError) {
      // Keep the recorder usable for a final durable upload if streaming drops.
      streamingActiveRef.current = false;
      clearStreamingTimer();
      setError(streamError instanceof Error ? streamError.message : t("recording.uploadFailed"));
    } finally {
      rotatingChunkRef.current = false;
    }
  };

  // Remember this URI for the final concatenated upload. Preview uploads never
  // create a durable history entry — they only feed live text.
  useEffect(() => {
    let cancelled = false;

    const begin = async () => {
      setError(null);
      setStatus("recording");
      liveTextRef.current = "";
      setLiveText("");
      streamedChunkUrisRef.current = [];
      // Soft health check — don't block recording start.
      if (baseUrl) void probeServerHealth(baseUrl);
      try {
        let { status: micStatus } = await Audio.getPermissionsAsync();
        if (micStatus !== "granted") {
          ({ status: micStatus } = await Audio.requestPermissionsAsync());
        }
        setMeter(0);
        setMicDenied(false);
        if (micStatus !== "granted") {
          setMicDenied(true);
          setStatus("idle");
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });
        const recording = await mobileRecordingSession.prepare(
          prepareAndStartRecording,
        );
        bindMetering(recording);
        void loadDesktopFeedbackSettings(token, baseUrl ?? undefined);
        void playFeedbackSound("start");
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        void activateKeepAwakeAsync("recording");
        if (cancelled) {
          await mobileRecordingSession.stop(recording);
          return;
        }
        recordingRef.current = recording;
        startTimeRef.current = Date.now();
        pausedAccumRef.current = 0;
        startTimer();
        if (streamingEnabled && token && baseUrl) {
          const session = new RemoteStreamingSession(token, baseUrl, {
            onPartial: setLivePreview,
            onError: (code, message) => {
              streamingActiveRef.current = false;
              clearStreamingTimer();
              setError(`${code}: ${message}`);
            },
          });
          try {
            await session.connect();
            if (cancelled) {
              session.cancel();
            } else {
              streamSessionRef.current = session;
              streamingActiveRef.current = true;
              clearStreamingTimer();
              streamIntervalRef.current = setInterval(() => {
                void rotateStreamingChunk();
              }, STREAM_CHUNK_MS);
            }
          } catch {
            // The advertised capability may be stale or the desktop may be
            // busy. Keep the continuous recording and use the durable job path.
            session.close();
          }
        }
        // Keep capturing with the screen off / app backgrounded (Android needs a
        // foreground service + notification permission; iOS uses UIBackgroundModes).
        const bgOk = await startBackgroundRecording(
          t("recording.notifTitle"),
          t("recording.notifDesc"),
        );
        if (!bgOk && Platform.OS === "android" && !cancelled) {
          setError(t("recording.notifPermissionDenied"));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("pair.failed"));
        setStatus("idle");
      }
    };

    void begin();

    return () => {
      cancelled = true;
      clearTimer();
      clearStreamingTimer();
      streamSessionRef.current?.cancel();
      streamSessionRef.current = null;
      streamingActiveRef.current = false;
      void stopBackgroundRecording();
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        void mobileRecordingSession.stop(rec).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android can't capture microphone audio without a foreground service, and JS
  // chunk timers are frozen while backgrounded — so anything spoken with the app
  // in the background / screen off is lost. Detect the transition and auto-pause,
  // flushing whatever was captured so far as a chunk. This keeps already-spoken
  // audio, and the user sees a clear "paused" state instead of talking into a
  // dead session and hitting an error on finish.
  const flushAndPauseForBackground = async () => {
    if (finishingRef.current) return;
    const rec = recordingRef.current;
    if (!rec) return;
    clearTimer();
    pausedAccumRef.current =
      useRecordingStore.getState().elapsedMs || pausedAccumRef.current;
    setStatus("paused");
    setError(t("recording.backgroundPaused"));
    try {
      // Keep the continuous file intact — pause instead of stop/rotate.
      await rec.pauseAsync();
    } catch {
      // Couldn't cleanly pause (recording likely interrupted). Drop the
      // handle so resume recreates a fresh recorder instead of failing.
      recordingRef.current = null;
      await mobileRecordingSession.stop(rec).catch(() => undefined);
    }
  };

  useEffect(() => {
    // iOS keeps capturing in the background (UIBackgroundModes: ['audio']), so
    // only auto-pause on Android, where background mic capture isn't available.
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") return;
      if (useRecordingStore.getState().status !== "recording") return;
      // If the foreground service is up, recording keeps going in the background —
      // don't pause. Only fall back to auto-pause when the service isn't running.
      if (isBackgroundRecordingActive()) return;
      void flushAndPauseForBackground();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingEnabled]);

  const handlePauseResume = async () => {
    if (status === "recording") {
      const rec = recordingRef.current;
      if (!rec) return;
      await rec.pauseAsync();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pausedAccumRef.current = elapsedMs;
      clearTimer();
      setStatus("paused");
    } else if (status === "paused") {
      try {
        // The recorder may have been dropped when the app was backgrounded —
        // recreate a fresh one instead of failing to resume.
        let rec = recordingRef.current;
        if (rec) {
          await rec.startAsync();
        } else {
          rec = await mobileRecordingSession.prepare(prepareAndStartRecording);
          recordingRef.current = rec;
        }
        bindMetering(rec);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setError(null);
        startTimeRef.current = Date.now();
        setStatus("recording");
        startTimer();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("recording.uploadFailed"));
      }
    }
  };

  const handleFinish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearTimer();
    clearStreamingTimer();
    setStatus("processing");
    void playFeedbackSound("stop");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void deactivateKeepAwake("recording");
    void stopBackgroundRecording();

    try {
      const rec = recordingRef.current;
      recordingRef.current = null;
      let uri: string | null = null;
      if (rec) {
        try {
          await mobileRecordingSession.stop(rec);
          uri = rec.getURI();
        } catch {
          // The recorder was interrupted (e.g. app backgrounded / screen off on
          // Android) and captured no valid data. Don't surface the raw expo-av
          // error or discard anything — fall through and rely on whatever live
          // text was already transcribed before the interruption.
          uri = null;
        }
      }
      const durationMs = elapsedMs || pausedAccumRef.current;
      const recordingId = `recording-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const recordingUris = [
        ...streamedChunkUrisRef.current,
        ...(uri ? [uri] : []),
      ];

      if (!token) {
        if (uri) {
          let sizeBytes: number | undefined;
          try {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) sizeBytes = info.size;
          } catch {
            // keep undefined
          }
          addToOfflineQueue({
            id: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            durationMs,
            uri,
            uris: recordingUris,
            sizeBytes,
            status: "pending",
            recordingId,
          });
        }
        setResult({
          text: liveTextRef.current || t("recording.audioSaved"),
          durationMs,
          audioUri: uri,
        });
        router.replace("/offline-queue");
        return;
      }

      // Final upload is one continuous recording — never a stitch of preview chunks.

      try {
        const streamSession = streamSessionRef.current;
        if (uri && streamingActiveRef.current && streamSession) {
          await streamSession.sendAudioFile(uri);
          const result = await streamSession.finish(postProcessEnabled);
          streamSessionRef.current = null;
          streamingActiveRef.current = false;
          const completedUris = [...streamedChunkUrisRef.current, uri];
          streamedChunkUrisRef.current = [];
          void Promise.all(
            completedUris.map((path) =>
              FileSystem.deleteAsync(path, { idempotent: true }).catch(
                () => undefined,
              ),
            ),
          );
          const finalText = (
            result.finalText ||
            result.rawText ||
            liveTextRef.current ||
            ""
          ).trim();
          setResult({
            text: finalText,
            durationMs,
            audioUri: uri,
            model: result.model ?? activeModel?.name,
            postProcessed: result.postProcessed,
            id: result.id,
          });
        } else if (uri) {
          const result = await uploadWithRetry(token, recordingUris, {
            postProcess: postProcessEnabled,
            baseUrl: baseUrl ?? undefined,
            filename: "recording.m4a",
            attempts: 3,
            recordingId,
          });
          const finalText = (
            result.finalText ||
            result.rawText ||
            liveTextRef.current ||
            ""
          ).trim();
          setResult({
            text: finalText,
            durationMs,
            audioUri: uri,
            model: result.model ?? activeModel?.name,
            postProcessed: result.postProcessed,
            id: result.id && result.id !== "preview" ? result.id : null,
          });
        } else if (liveTextRef.current) {
          setResult({
            text: liveTextRef.current,
            durationMs,
            model: activeModel?.name,
            postProcessed: false,
          });
        } else {
          throw new Error("missing_uri");
        }
        void queryClient.invalidateQueries({ queryKey: ["history"] });
        router.replace("/result");
      } catch (uploadError) {
        // A partial WebSocket preview is not a completed transcription. Showing
        // it as one drops the server history id and makes playback/reprocess
        // look broken. Keep the captured audio queued until the PC confirms it.
        if (uri) {
          addToOfflineQueue({
            id: `q-${Date.now()}`,
            createdAt: new Date().toISOString(),
            durationMs,
            uri,
            uris: recordingUris,
            status: "pending",
            recordingId,
            errorCode: apiErrorCode(uploadError) ?? undefined,
            error: uploadError instanceof Error ? uploadError.message : undefined,
          });
          router.replace("/recording-reconnect");
          return;
        }
        setError(
          useConnectionStore.getState().needsRepair
            ? t("recording.pairingExpired")
            : t("recording.uploadFailed"),
        );
        setStatus("idle");
        finishingRef.current = false;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pair.failed"));
      setStatus("idle");
      finishingRef.current = false;
    }
  };

  const handleCancel = async () => {
    setCancelConfirmOpen(true);
  };

  const handleCancelConfirmed = async () => {
    setCancelConfirmOpen(false);
    clearTimer();
    clearStreamingTimer();
    finishingRef.current = true;
    streamSessionRef.current?.cancel();
    streamSessionRef.current = null;
    streamingActiveRef.current = false;
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await mobileRecordingSession.stop(rec);
      } catch {
        // ignore
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void deactivateKeepAwake("recording");
    void stopBackgroundRecording();
    resetSession();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>{t("recording.title")}</Text>
          </View>
          {computer ? (
            <Text style={styles.computer}>{computer.name}</Text>
          ) : null}
        </View>

        <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
        <Waveform
          active={status === "recording"}
          amplitude={meter}
          height={88}
        />

        {streamingEnabled ? (
          <ScrollView
            style={styles.liveBox}
            contentContainerStyle={styles.liveBoxContent}
          >
            <Text style={styles.liveText}>
              {liveText || t("recording.livePreview")}
            </Text>
          </ScrollView>
        ) : null}

        {status === "processing" ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.processingText}>{t("common.loading")}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {micDenied ? (
          <View style={styles.permissionBox}>
            <Ionicons name="mic-off-outline" size={40} color={colors.error} />
            <Text style={styles.permissionTitle}>
              {t("recording.microphoneDenied")}
            </Text>
            <Text style={styles.permissionHint}>
              {t("recording.permissionRequired")}
            </Text>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={() => void Linking.openSettings()}
            >
              <Text style={styles.permissionBtnText}>
                {t("recording.openSettings")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => void handleCancel()}
            accessibilityLabel={t("recording.cancel")}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color={colors.text} />
            <Text style={styles.sideLabel}>{t("recording.cancel")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mainBtn}
            onPress={() => void handleFinish()}
            disabled={status === "processing"}
            accessibilityLabel={t("recording.finish")}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark" size={36} color={colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => void handlePauseResume()}
            disabled={status === "processing"}
            accessibilityLabel={
              status === "paused" ? t("recording.resume") : t("recording.pause")
            }
            accessibilityRole="button"
          >
            <Ionicons
              name={status === "paused" ? "play" : "pause"}
              size={28}
              color={colors.text}
            />
            <Text style={styles.sideLabel}>
              {status === "paused"
                ? t("recording.resume")
                : t("recording.pause")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ActionSheet
        visible={cancelConfirmOpen}
        title={t("recording.cancelConfirmTitle")}
        message={t("recording.cancelConfirmBody")}
        cancelLabel={t("common.cancel")}
        onClose={() => setCancelConfirmOpen(false)}
        options={[
          {
            label: t("recording.cancelConfirmAction"),
            icon: "trash-outline",
            destructive: true,
            onPress: () => void handleCancelConfirmed(),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    topRow: {
      alignItems: "center",
      gap: spacing.sm,
    },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.warningSoft,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.recording,
    },
    liveLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.recording,
    },
    computer: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
    },
    timer: {
      fontSize: 52,
      fontWeight: typography.weights.bold,
      color: colors.text,
      textAlign: "center",
      marginVertical: spacing.lg,
      fontVariant: ["tabular-nums"],
    },
    liveBox: {
      maxHeight: 140,
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    liveBoxContent: {
      padding: spacing.md,
    },
    liveText: {
      fontSize: typography.sizes.md,
      color: colors.text,
      lineHeight: 22,
    },
    processing: {
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    processingText: { color: colors.midGray },
    error: {
      color: colors.error,
      textAlign: "center",
      marginTop: spacing.md,
    },
    controls: {
      marginTop: "auto",
      paddingBottom: spacing.xxl,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sideBtn: {
      width: 88,
      alignItems: "center",
      gap: spacing.xs,
    },
    sideLabel: {
      fontSize: typography.sizes.xs,
      color: colors.midGray,
    },
    mainBtn: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    permissionBox: {
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      ...shadows.card,
    },
    permissionTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      textAlign: "center",
    },
    permissionHint: {
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },
    permissionBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
    },
    permissionBtnText: {
      color: colors.white,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
  });
