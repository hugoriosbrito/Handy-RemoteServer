import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/ui';
import { colors, spacing, typography, radius, shadows } from '@/theme/tokens';
import { api, Transcription } from '@/api/client';
import { formatDuration, useRecordingStore } from '@/stores/recordingStore';
import { useConnectionStore } from '@/stores/connectionStore';

function dayKey(dateStr: string): string {
  return new Date(dateStr).toDateString();
}

function formatDateLabel(dateStr: string, t: (k: string) => string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t('history.today');
  if (date.toDateString() === yesterday.toDateString()) return t('history.yesterday');
  return date.toLocaleDateString();
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'phone' | 'computer'>('all');

  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);

  const { data, isLoading } = useQuery({
    queryKey: ['history', token, baseUrl],
    queryFn: async () => {
      if (!token) return { items: [] as Transcription[] };
      try {
        return await api.getHistory(token, baseUrl ?? undefined);
      } catch {
        return { items: [] as Transcription[] };
      }
    },
    enabled: Boolean(token),
  });

  const filtered = useMemo(() => {
    return (data?.items ?? []).filter((item) => {
      if (search && !item.text.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (sourceFilter === 'phone') {
        return (item.computerName ?? '').toLowerCase().includes('mobile')
          || (item.computerName ?? '').toLowerCase().includes('phone');
      }
      if (sourceFilter === 'computer') {
        return !(
          (item.computerName ?? '').toLowerCase().includes('mobile')
          || (item.computerName ?? '').toLowerCase().includes('phone')
        );
      }
      return true;
    });
  }, [data?.items, search, sourceFilter]);

  const sections = useMemo(() => {
    const map = new Map<string, Transcription[]>();
    for (const item of filtered) {
      const key = dayKey(item.createdAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      title: formatDateLabel(items[0]?.createdAt ?? key, t),
      data: items,
    }));
  }, [filtered, t]);

  const handlePress = (item: Transcription) => {
    useRecordingStore.setState({
      lastTranscription: item.text,
      lastDurationMs: item.durationMs,
      lastAudioUri: null,
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

        <View style={styles.filters}>
          {([
            ['all', t('common.all')],
            ['phone', t('history.phone')],
            ['computer', t('history.computer')],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, sourceFilter === key && styles.chipActive]}
              onPress={() => setSourceFilter(key)}
            >
              <Text
                style={[
                  styles.chipText,
                  sourceFilter === key && styles.chipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <Text style={styles.empty}>{t('common.loading')}</Text>
        ) : sections.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={48} color={colors.midGray} />
            <Text style={styles.empty}>{t('history.empty')}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
                style={styles.item}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemDuration}>
                    {formatDuration(item.durationMs)}
                  </Text>
                  <Ionicons
                    name={
                      (item.computerName ?? '').toLowerCase().includes('mobile')
                        ? 'phone-portrait-outline'
                        : 'desktop-outline'
                    }
                    size={16}
                    color={colors.midGray}
                  />
                </View>
                <Text style={styles.itemText} numberOfLines={3}>
                  {item.text}
                </Text>
              </TouchableOpacity>
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
  safe: { flex: 1, backgroundColor: colors.backgroundAlt },
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
  search: { marginBottom: spacing.sm },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.codeBg,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  list: { paddingBottom: spacing.xl },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.midGray,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  item: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
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
