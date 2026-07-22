import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';

export default function RecordingReconnectScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setReconnecting = useConnectionStore((s) => s.setReconnecting);

  useEffect(() => {
    setReconnecting(true);
    const timer = setTimeout(() => {
      setReconnecting(false);
      router.replace('/recording');
    }, 2500);
    return () => {
      clearTimeout(timer);
      setReconnecting(false);
    };
  }, [router, setReconnecting]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>{t('recording.reconnecting')}</Text>
        <Text style={styles.subtitle}>{t('recording.reconnectingHint')}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.midGray,
    textAlign: 'center',
    lineHeight: 24,
  },
});
