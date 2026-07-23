import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Waveform } from '@/components/ui';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useRecordingStore, formatDuration } from '@/stores/recordingStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/api/client';

export default function RecordingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      if (useRecordingStore.getState().status === 'recording') {
        setElapsed(pausedAccumRef.current + (Date.now() - startTimeRef.current));
      }
    }, 200);
  };

  useEffect(() => {
    let cancelled = false;

    const begin = async () => {
      setError(null);
      setStatus('recording');
      try {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        await recording.startAsync();
        if (cancelled) {
          await recording.stopAndUnloadAsync();
          return;
        }
        recordingRef.current = recording;
        startTimeRef.current = Date.now();
        pausedAccumRef.current = 0;
        startTimer();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('pair.failed'));
        setStatus('idle');
      }
    };

    void begin();

    return () => {
      cancelled = true;
      clearTimer();
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        void rec.stopAndUnloadAsync().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePauseResume = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    if (status === 'recording') {
      await rec.pauseAsync();
      pausedAccumRef.current = elapsedMs;
      clearTimer();
      setStatus('paused');
    } else if (status === 'paused') {
      await rec.startAsync();
      startTimeRef.current = Date.now();
      setStatus('recording');
      startTimer();
    }
  };

  const handleFinish = async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    clearTimer();
    setStatus('processing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      const durationMs = elapsedMs || pausedAccumRef.current;

      if (!uri) {
        throw new Error('missing_uri');
      }

      if (!token) {
        addToOfflineQueue({
          id: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          durationMs,
          uri,
          status: 'pending',
        });
        setResult({
          text: t('recording.audioSaved'),
          durationMs,
          audioUri: uri,
        });
        router.replace('/offline-queue');
        return;
      }

      try {
        const result = await api.uploadTranscription(token, uri, {
          postProcess: postProcessEnabled,
          baseUrl: baseUrl ?? undefined,
          filename: 'recording.m4a',
        });
        setResult({
          text: result.finalText || result.rawText,
          durationMs,
          audioUri: uri,
          model: result.model,
          postProcessed: result.postProcessed,
        });
        router.replace('/result');
      } catch {
        addToOfflineQueue({
          id: `q-${Date.now()}`,
          createdAt: new Date().toISOString(),
          durationMs,
          uri,
          status: 'pending',
        });
        router.replace('/recording-reconnect');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pair.failed'));
      setStatus('idle');
    }
  };

  const handleCancel = async () => {
    clearTimer();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        // ignore
      }
    }
    resetSession();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>{t('recording.title')}</Text>
          </View>
          {computer ? (
            <Text style={styles.computer}>{computer.name}</Text>
          ) : null}
        </View>

        <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
        <Waveform active={status === 'recording'} height={88} />

        {status === 'processing' ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.processingText}>{t('common.loading')}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.controls}>
          <TouchableOpacity style={styles.sideBtn} onPress={() => void handleCancel()}>
            <Ionicons name="close" size={28} color={colors.text} />
            <Text style={styles.sideLabel}>{t('recording.cancel')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mainBtn}
            onPress={() => void handleFinish()}
            disabled={status === 'processing'}
          >
            <Ionicons name="checkmark" size={36} color={colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => void handlePauseResume()}
            disabled={status === 'processing'}
          >
            <Ionicons
              name={status === 'paused' ? 'play' : 'pause'}
              size={28}
              color={colors.text}
            />
            <Text style={styles.sideLabel}>
              {status === 'paused' ? t('recording.resume') : t('recording.pause')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  topRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FDECEC',
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
    textAlign: 'center',
    marginVertical: spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  processing: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  processingText: { color: colors.midGray },
  error: {
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  controls: {
    marginTop: 'auto',
    paddingBottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideBtn: {
    width: 88,
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});
