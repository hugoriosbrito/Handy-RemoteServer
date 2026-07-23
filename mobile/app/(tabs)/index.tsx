import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Toggle } from '@/components/ui';
import { HandyIcon } from '@/components/HandyLogo';
import { spacing, typography, radius, shadows, type ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useSettingsStore } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { api } from '@/api/client';
import { probeServerHealth } from '@/lib/connection';

export default function RecordTabScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const postProcessEnabled = useSettingsStore((s) => s.postProcessEnabled);
  const setPostProcess = useSettingsStore((s) => s.setPostProcess);
  const computer = useConnectionStore((s) => s.computer);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const lastTranscription = useRecordingStore((s) => s.lastTranscription);
  const offlineCount = useRecordingStore((s) => s.offlineQueue.length);

  const modelsQuery = useQuery({
    queryKey: ['models', token, baseUrl],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { models: [], activeModelId: null };
      return api.getModels(token, baseUrl ?? undefined);
    },
  });
  const activeModel = modelsQuery.data?.models.find((m) => m.isActive);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleStart = () => {
    if (!computer) {
      router.push('/pair/scan');
      return;
    }
    // Refresh reachability before opening the recorder (non-blocking).
    if (baseUrl) void probeServerHealth(baseUrl);
    router.push('/recording');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <HandyIcon size={36} />
          <Text style={styles.headerTitle}>{t('record.title')}</Text>
        </View>

        {offlineCount > 0 ? (
          <TouchableOpacity
            style={styles.queueBanner}
            onPress={() => router.push('/offline-queue')}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.warning} />
            <Text style={styles.queueText}>
              {t('offlineQueue.pending', { count: offlineCount })}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.pcCard}
          onPress={() => router.push('/computers')}
          activeOpacity={0.85}
        >
          <View style={styles.pcIcon}>
            <Ionicons name="desktop-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.pcInfo}>
            <Text style={styles.pcName}>
              {computer ? computer.name : t('record.notConnected')}
            </Text>
            <Text style={styles.pcMeta}>
              {!computer
                ? t('common.disconnected')
                : computer.isOnline
                  ? t('record.onlineLocal')
                  : t('common.offline')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.midGray} />
        </TouchableOpacity>

        <View style={styles.modelCard}>
          <TouchableOpacity
            style={styles.modelHeader}
            onPress={() => {
              if (computer) router.push('/models');
            }}
            activeOpacity={computer ? 0.7 : 1}
          >
            <View style={styles.modelInfo}>
              <Text style={styles.modelLabel}>
                {activeModel ? activeModel.name : t('record.modelFallback')}
              </Text>
              <Text style={styles.modelMeta}>
                {activeModel?.supportsStreaming
                  ? t('record.modelStreaming')
                  : activeModel
                    ? t('record.modelOffline')
                    : t('record.modelMeta')}
              </Text>
            </View>
            {computer ? (
              <Ionicons name="chevron-forward" size={20} color={colors.midGray} />
            ) : null}
          </TouchableOpacity>
          <View style={styles.modelDivider} />
          <Toggle
            value={postProcessEnabled}
            onValueChange={setPostProcess}
            label={t('record.postProcess')}
            hint={t('record.postProcessHint')}
          />
        </View>

        <View style={styles.recordArea}>
          <TouchableOpacity
            style={styles.micButtonOuter}
            onPress={handleStart}
            activeOpacity={0.9}
          >
            <View style={styles.micButtonInner}>
              <Ionicons name="mic" size={48} color={colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.tapHint}>{t('record.tapToRecord')}</Text>
        </View>

        {lastTranscription ? (
          <TouchableOpacity
            style={styles.lastCard}
            onPress={() => router.push('/result')}
            activeOpacity={0.85}
          >
            <Text style={styles.lastLabel}>{t('record.lastTranscription')}</Text>
            <Text style={styles.lastText} numberOfLines={2}>
              {lastTranscription}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundAlt },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  queueText: {
    flex: 1,
    color: colors.warning,
    fontWeight: typography.weights.medium,
    fontSize: typography.sizes.sm,
  },
  pcCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  pcIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  pcInfo: { flex: 1 },
  pcName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  pcMeta: {
    marginTop: 2,
    fontSize: typography.sizes.sm,
    color: colors.midGray,
  },
  modelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelInfo: { flex: 1 },
  modelDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  modelLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  modelMeta: {
    marginTop: 2,
    fontSize: typography.sizes.sm,
    color: colors.midGray,
  },
  recordArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  micButtonOuter: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  lastCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  lastLabel: {
    fontSize: typography.sizes.xs,
    color: colors.midGray,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  lastText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    lineHeight: 22,
  },
});
