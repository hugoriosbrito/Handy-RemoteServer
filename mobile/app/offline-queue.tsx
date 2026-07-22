import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui';
import { colors, spacing, typography } from '@/theme/tokens';
import { useRecordingStore, formatDuration } from '@/stores/recordingStore';

export default function OfflineQueueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const offlineQueue = useRecordingStore((s) => s.offlineQueue);
  const removeFromOfflineQueue = useRecordingStore((s) => s.removeFromOfflineQueue);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>{t('offlineQueue.title')}</Text>
        <Text style={styles.subtitle}>{t('offlineQueue.subtitle')}</Text>

        {offlineQueue.length > 0 && (
          <Text style={styles.pending}>
            {t('offlineQueue.pending', { count: offlineQueue.length })}
          </Text>
        )}

        {offlineQueue.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.midGray} />
            <Text style={styles.emptyText}>{t('offlineQueue.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={offlineQueue}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Card style={styles.item}>
                <View style={styles.itemRow}>
                  <Ionicons name="musical-note" size={24} color={colors.primary} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemDuration}>
                      {formatDuration(item.durationMs)}
                    </Text>
                    <Text style={styles.itemDate}>
                      {new Date(item.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'failed' && styles.statusFailed,
                    ]}
                  >
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.retryBtn}>
                  <Text style={styles.retryText}>{t('offlineQueue.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeFromOfflineQueue(item.id)}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </Card>
            )}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: 'center',
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
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  item: {
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  itemInfo: {
    flex: 1,
  },
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
  statusFailed: {
    backgroundColor: '#FDECEC',
  },
  statusText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    textTransform: 'capitalize',
  },
  retryBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  retryText: {
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyText: {
    color: colors.midGray,
    fontSize: typography.sizes.md,
  },
});
