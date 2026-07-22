import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Waveform } from '@/components/ui';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useRecordingStore, formatDuration } from '@/stores/recordingStore';

export default function RecordingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useRecordingStore((s) => s.status);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const liveText = useRecordingStore((s) => s.liveText);
  const start = useRecordingStore((s) => s.start);
  const pause = useRecordingStore((s) => s.pause);
  const resume = useRecordingStore((s) => s.resume);
  const stop = useRecordingStore((s) => s.stop);
  const cancel = useRecordingStore((s) => s.cancel);
  const tick = useRecordingStore((s) => s.tick);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);

  useEffect(() => {
    start();
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      if (useRecordingStore.getState().status === 'recording') {
        tick(Date.now() - startTimeRef.current);
      }
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [start, tick]);

  const handlePauseResume = () => {
    if (status === 'recording') {
      pause();
      pausedAtRef.current = elapsedMs;
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else if (status === 'paused') {
      resume();
      startTimeRef.current = Date.now() - pausedAtRef.current;
      intervalRef.current = setInterval(() => {
        tick(Date.now() - startTimeRef.current);
      }, 200);
    }
  };

  const handleFinish = () => {
    stop();
    router.replace('/result');
  };

  const handleCancel = () => {
    cancel();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('recording.title')}</Text>
        <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>

        <Waveform active={status === 'recording'} height={80} />

        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>{t('recording.livePreview')}</Text>
          <Text style={styles.liveText}>{liveText || '…'}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleCancel} style={styles.textAction}>
            <Text style={styles.cancelText}>{t('recording.cancel')}</Text>
          </TouchableOpacity>

          <Button
            title={status === 'paused' ? t('recording.resume') : t('recording.pause')}
            onPress={handlePauseResume}
            variant="ghost"
            style={styles.midBtn}
          />

          <Button title={t('recording.finish')} onPress={handleFinish} style={styles.finishBtn} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: typography.sizes.lg,
    color: colors.midGray,
    textAlign: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginVertical: spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  liveBox: {
    flex: 1,
    backgroundColor: colors.codeBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  liveLabel: {
    fontSize: typography.sizes.xs,
    color: colors.midGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  liveText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    lineHeight: 24,
  },
  actions: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  textAction: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.midGray,
    fontSize: typography.sizes.md,
  },
  midBtn: {
    width: '100%',
  },
  finishBtn: {
    width: '100%',
  },
});
