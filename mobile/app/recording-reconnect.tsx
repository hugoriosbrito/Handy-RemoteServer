import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/api/client';

export default function RecordingReconnectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  useEffect(() => {
    setReconnecting(true);
    let cancelled = false;

    const retry = async () => {
      const pending = offlineQueue.find((q) => q.status === 'pending' || q.status === 'failed');
      if (!pending || !token) {
        setFailed(true);
        setReconnecting(false);
        return;
      }

      updateQueueItem(pending.id, { status: 'uploading' });
      try {
        const result = await api.uploadTranscription(token, pending.uri, {
          postProcess: postProcessEnabled,
          baseUrl: baseUrl ?? undefined,
        });
        if (cancelled) return;
        removeFromOfflineQueue(pending.id);
        setResult({
          text: result.finalText || result.rawText,
          durationMs: pending.durationMs,
          audioUri: pending.uri,
          model: result.model,
          postProcessed: result.postProcessed,
        });
        setReconnecting(false);
        router.replace('/result');
      } catch {
        if (cancelled) return;
        updateQueueItem(pending.id, { status: 'failed' });
        setFailed(true);
        setReconnecting(false);
      }
    };

    const timer = setTimeout(() => {
      void retry();
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setReconnecting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={failed ? 'cloud-offline-outline' : 'sync'}
            size={40}
            color={colors.warning}
          />
        </View>
        <Text style={styles.title}>
          {failed ? t('recording.audioSaved') : t('recording.reconnecting')}
        </Text>
        <Text style={styles.subtitle}>
          {failed
            ? t('offlineQueue.computerOffline', {
                name: computer?.name ?? 'Handy',
              })
            : t('recording.tryingComputer', {
                name: computer?.name ?? 'Handy',
              })}
        </Text>
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
