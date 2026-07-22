import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Card } from '@/components/ui';
import { colors, spacing, typography } from '@/theme/tokens';
import { api, Transcription } from '@/api/client';
import { formatDuration, useRecordingStore } from '@/stores/recordingStore';

function formatDateLabel(dateStr: string, t: (k: string) => string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('history.today');
  if (date.toDateString() === yesterday.toDateString()) return t('history.yesterday');
  return date.toLocaleDateString('pt-BR');
}

function HistoryItem({
  item,
  onPress,
}: {
  item: Transcription;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.item}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemDate}>{formatDateLabel(item.createdAt, t)}</Text>
          <Text style={styles.itemDuration}>{formatDuration(item.durationMs)}</Text>
        </View>
        <Text style={styles.itemText} numberOfLines={2}>
          {item.text}
        </Text>
        {item.computerName && (
          <View style={styles.computerRow}>
            <Ionicons name="desktop-outline" size={14} color={colors.midGray} />
            <Text style={styles.computerName}>{item.computerName}</Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.getHistoryMock(),
  });

  const items = (data?.items ?? []).filter(
    (item) =>
      !search || item.text.toLowerCase().includes(search.toLowerCase()),
  );

  const handlePress = (item: Transcription) => {
    useRecordingStore.setState({
      lastTranscription: item.text,
      lastDurationMs: item.durationMs,
    });
    router.push('/result');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('history.title')}</Text>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder')}
          style={styles.search}
        />

        {isLoading ? (
          <Text style={styles.empty}>{t('common.search')}…</Text>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={48} color={colors.midGray} />
            <Text style={styles.empty}>{t('history.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HistoryItem item={item} onPress={() => handlePress(item)} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
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
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  search: {
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  item: {
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  itemDate: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    fontWeight: typography.weights.medium,
  },
  itemDuration: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  itemText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  computerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  computerName: {
    fontSize: typography.sizes.xs,
    color: colors.midGray,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  empty: {
    fontSize: typography.sizes.md,
    color: colors.midGray,
    textAlign: 'center',
  },
});
