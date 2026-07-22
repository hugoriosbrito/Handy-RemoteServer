import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenHeader } from '@/components/ui';
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.illustration}>
          <View style={styles.micCircle}>
            <Ionicons name="mic" size={64} color={colors.primary} />
          </View>
        </View>

        <ScreenHeader
          title={t('onboarding.microphoneTitle')}
          subtitle={t('onboarding.microphoneSubtitle')}
        />

        <View style={styles.actions}>
          <Button title={t('onboarding.allow')} onPress={() => finish(true)} />
          <Button
            title={t('onboarding.notNow')}
            onPress={() => finish(false)}
            variant="ghost"
            style={styles.secondary}
          />
        </View>
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
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  illustration: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  micCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.logoPrimary,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  secondary: {
    marginTop: spacing.sm,
  },
});
