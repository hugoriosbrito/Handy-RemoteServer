import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { spacing, typography, radius, type ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { probeServerHealth, uploadWithRetry } from '@/lib/connection';

type FailReason = 'offline' | 'upload';

export default function RecordingReconnectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setReconnecting = useConnectionStore((s) => s.setReconnecting);
  const computer = useConnectionStore((s) => s.computer);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const offlineQueue = useRecordingStore((s) => s.offlineQueue);
  const updateQueueItem = useRecordingStore((s) => s.updateQueueItem);
  const removeFromOfflineQueue = useRecordingStore((s) => s.removeFromOfflineQueue);
  const setResult = useRecordingStore((s) => s.setResult);
  const postProcessEnabled = useSettingsStore((s) => s.postProcessEnabled);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<FailReason>('offline');
  const [attempt, setAttempt] = useState(0);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    setReconnecting(true);
    let cancelled = false;

    const retry = async () => {
      const pending = offlineQueue.find((q) => q.status === 'pending' || q.status === 'failed');
      if (!pending || !token) {
        setFailReason('offline');
        setFailed(true);
        setReconnecting(false);
        return;
      }

      updateQueueItem(pending.id, { status: 'uploading' });

      // Probe first — if the PC is up, upload with retries instead of
      // immediately declaring "offline".
      const online = await probeServerHealth(baseUrl);
      if (cancelled) return;

      if (!online) {
        // Keep trying a few times before showing the failed state.
        for (let i = 0; i < 4 && !cancelled; i++) {
          setAttempt(i + 1);
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          if (await probeServerHealth(baseUrl)) break;
          if (i === 3) {
            updateQueueItem(pending.id, { status: 'failed' });
            setFailReason('offline');
            setFailed(true);
            setReconnecting(false);
            return;
          }
        }
      }

      if (cancelled) return;

      try {
        setAttempt((a) => a + 1);
        const result = await uploadWithRetry(token, pending.uri, {
          postProcess: postProcessEnabled,
          baseUrl: baseUrl ?? undefined,
          attempts: 3,
        });
        if (cancelled) return;
        removeFromOfflineQueue(pending.id);
        setResult({
          text: result.finalText || result.rawText,
          durationMs: pending.durationMs,
          audioUri: pending.uri,
          model: result.model,
          postProcessed: result.postProcessed,
          id: result.id,
        });
        void queryClient.invalidateQueries({ queryKey: ['history'] });
        setReconnecting(false);
        router.replace('/result');
      } catch {
        if (cancelled) return;
        updateQueueItem(pending.id, { status: 'failed' });
        const stillOnline = await probeServerHealth(baseUrl);
        setFailReason(stillOnline ? 'upload' : 'offline');
        setFailed(true);
        setReconnecting(false);
      }
    };

    const timer = setTimeout(() => {
      void retry();
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setReconnecting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtitle = failed
    ? failReason === 'upload'
      ? t('recording.sendFailed', { name: computer?.name ?? 'Handy' })
      : t('offlineQueue.computerOffline', { name: computer?.name ?? 'Handy' })
    : attempt > 0
      ? t('recording.tryingComputerAttempt', {
          name: computer?.name ?? 'Handy',
          attempt,
        })
      : t('recording.tryingComputer', { name: computer?.name ?? 'Handy' });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={failed ? (failReason === 'upload' ? 'alert-circle-outline' : 'cloud-offline-outline') : 'sync'}
            size={40}
            color={colors.warning}
          />
        </View>
        <Text style={styles.title}>
          {failed
            ? failReason === 'upload'
              ? t('recording.sendFailedTitle')
              : t('recording.audioSaved')
            : t('recording.reconnecting')}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {!failed ? <ActivityIndicator size="large" color={colors.warning} /> : null}
        {failed ? (
          <View style={styles.actions}>
            <Button
              title={t('recording.finishAndSave')}
              onPress={() => router.replace('/offline-queue')}
            />
            <Button
              title={t('common.retry')}
              variant="ghost"
              onPress={() => router.replace('/recording-reconnect')}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.warningSoft },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.md,
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: typography.sizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: spacing.md,
    },
    actions: {
      width: '100%',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
  });
