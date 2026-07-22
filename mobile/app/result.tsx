import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Button, Card } from '@/components/ui';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useRecordingStore, formatDuration } from '@/stores/recordingStore';

export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const lastTranscription = useRecordingStore((s) => s.lastTranscription);
  const lastDurationMs = useRecordingStore((s) => s.lastDurationMs);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);

  const text =
    lastTranscription ??
    'Esta é a transcrição finalizada. O texto foi processado pelo Handy no computador.';

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable on web
    }
  };

  const handleShare = async () => {
    await Share.share({ message: text });
  };

  const handleRecordAgain = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('result.title')}</Text>
        <Text style={styles.duration}>
          {t('result.duration', { duration: formatDuration(lastDurationMs) })}
        </Text>

        <Card style={styles.textCard}>
          <Text style={styles.transcription}>{text}</Text>
        </Card>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>
              {copied ? t('result.copied') : t('common.copy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('common.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('common.more')}</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.playerCard}>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => setPlaying((p) => !p)}
          >
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={28}
              color={colors.white}
            />
          </TouchableOpacity>
          <View style={styles.playerTrack}>
            <View style={[styles.playerProgress, { width: playing ? '45%' : '0%' }]} />
          </View>
          <Text style={styles.playerTime}>{formatDuration(lastDurationMs)}</Text>
        </Card>

        <Button
          title={t('result.recordAgain')}
          onPress={handleRecordAgain}
          style={styles.recordAgain}
        />
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
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  duration: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  textCard: {
    flex: 1,
    maxHeight: 280,
    marginBottom: spacing.md,
  },
  transcription: {
    fontSize: typography.sizes.md,
    color: colors.text,
    lineHeight: 26,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  actionBtn: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  actionLabel: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  playerProgress: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  playerTime: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    fontVariant: ['tabular-nums'],
  },
  recordAgain: {
    marginBottom: spacing.xl,
  },
});
