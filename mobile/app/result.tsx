import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { Button } from '@/components/ui';
import { colors, spacing, typography, radius, shadows } from '@/theme/tokens';
import { useRecordingStore, formatDuration } from '@/stores/recordingStore';

export default function ResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const lastTranscription = useRecordingStore((s) => s.lastTranscription);
  const lastDurationMs = useRecordingStore((s) => s.lastDurationMs);
  const lastAudioUri = useRecordingStore((s) => s.lastAudioUri);
  const lastModel = useRecordingStore((s) => s.lastModel);
  const lastPostProcessed = useRecordingStore((s) => s.lastPostProcessed);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const text = lastTranscription ?? '';

  const meta = useMemo(
    () =>
      t('result.meta', {
        duration: formatDuration(lastDurationMs),
        model: lastModel ?? 'Whisper',
        processing: lastPostProcessed ? 'PP' : 'raw',
      }),
    [lastDurationMs, lastModel, lastPostProcessed, t],
  );

  const handleCopy = async () => {
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (!text) return;
    await Share.share({ message: text });
  };

  const handleMore = () => {
    Alert.alert(t('common.more'), undefined, [
      { text: t('common.copy'), onPress: () => void handleCopy() },
      { text: t('common.share'), onPress: () => void handleShare() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const togglePlay = async () => {
    if (!lastAudioUri) return;
    try {
      if (playing && sound) {
        await sound.pauseAsync();
        setPlaying(false);
        return;
      }
      if (sound) {
        await sound.playAsync();
        setPlaying(true);
        return;
      }
      const { sound: created } = await Audio.Sound.createAsync(
        { uri: lastAudioUri },
        { shouldPlay: true },
      );
      setSound(created);
      setPlaying(true);
      created.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) setPlaying(false);
      });
    } catch {
      // playback unavailable on some platforms
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('result.title')}</Text>
          <View style={{ width: 28 }} />
        </View>

        <Text style={styles.meta}>{meta}</Text>

        <View style={styles.textCard}>
          <Text style={styles.transcription}>{text || '—'}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void handleCopy()}>
            <Ionicons name="copy-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>
              {copied ? t('result.copied') : t('common.copy')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void handleShare()}>
            <Ionicons name="share-outline" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('common.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleMore}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('common.more')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.playerCard}>
          <Text style={styles.audioLabel}>{t('result.audio')}</Text>
          <View style={styles.playerRow}>
            <TouchableOpacity
              style={[styles.playBtn, !lastAudioUri && styles.playDisabled]}
              onPress={() => void togglePlay()}
              disabled={!lastAudioUri}
            >
              <Ionicons
                name={playing ? 'pause' : 'play'}
                size={24}
                color={colors.white}
              />
            </TouchableOpacity>
            <View style={styles.playerTrack}>
              <View style={[styles.playerProgress, { width: playing ? '45%' : '0%' }]} />
            </View>
            <Text style={styles.playerTime}>{formatDuration(lastDurationMs)}</Text>
          </View>
          <Text style={styles.expires}>{t('result.expiresIn')}</Text>
        </View>

        <Button
          title={t('result.recordAgain')}
          onPress={() => router.replace('/recording')}
          style={styles.recordAgain}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundAlt },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    marginBottom: spacing.md,
  },
  textCard: {
    flex: 1,
    maxHeight: 280,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
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
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  audioLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDisabled: { opacity: 0.4 },
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
  expires: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.midGray,
  },
  recordAgain: {
    marginBottom: spacing.xl,
  },
});
