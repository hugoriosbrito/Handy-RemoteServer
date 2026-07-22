import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HandyLogo } from '@/components/HandyLogo';
import { Button } from '@/components/ui';
import { colors, spacing, typography } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useConnectionStore((s) => s.token);
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);

  const handleConnect = () => {
    if (token && hasCompletedOnboarding) {
      router.replace('/(tabs)');
      return;
    }
    router.push('/pair/scan');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <HandyLogo size={100} />
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>
        </View>
        <Button title={t('welcome.connectComputer')} onPress={handleConnect} />
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
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.midGray,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
  },
});
