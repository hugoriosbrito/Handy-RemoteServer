import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Button } from '@/components/ui';
import { colors, spacing, radius, typography } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';

export default function MicrophoneOnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setMicrophoneGranted = useSettingsStore((s) => s.setMicrophoneGranted);
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);

  const finish = (granted: boolean) => {
    setMicrophoneGranted(granted);
    setOnboardingComplete(true);
    router.replace('/(tabs)');
  };

  const requestPermission = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      finish(status === 'granted');
    } catch {
      finish(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.illustration}>
          <View style={styles.micCircle}>
            <Ionicons name="mic" size={56} color={colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>{t('onboarding.microphoneTitle')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.microphoneSubtitle')}</Text>

        <View style={styles.note}>
          <Ionicons name="lock-closed" size={16} color={colors.midGray} />
          <Text style={styles.noteText}>{t('onboarding.privacyNote')}</Text>
        </View>

        <View style={styles.actions}>
          <Button title={t('onboarding.allow')} onPress={() => void requestPermission()} />
          <Button
            title={t('onboarding.notNow')}
            onPress={() => finish(false)}
            variant="ghost"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  illustration: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  micCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    lineHeight: 18,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
