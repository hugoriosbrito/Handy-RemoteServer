import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Toggle } from '@/components/ui';
import { HandyLogo } from '@/components/HandyLogo';
import { colors, spacing, typography, radius, shadows } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRecordingStore } from '@/stores/recordingStore';
import i18n, { setStoredLanguage } from '@/i18n';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const disconnect = useConnectionStore((s) => s.disconnect);
  const computer = useConnectionStore((s) => s.computer);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const backgroundRecord = useSettingsStore((s) => s.backgroundRecord);
  const setBackgroundRecord = useSettingsStore((s) => s.setBackgroundRecord);
  const biometrics = useSettingsStore((s) => s.biometrics);
  const setBiometrics = useSettingsStore((s) => s.setBiometrics);
  const offlineCount = useRecordingStore((s) => s.offlineQueue.length);

  const toggleLanguage = async () => {
    const next = language === 'pt-BR' ? 'en' : 'pt-BR';
    setLanguage(next);
    await setStoredLanguage(next);
    i18n.changeLanguage(next);
  };

  const handleDisconnect = async () => {
    await disconnect();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.brandRow}>
          <HandyLogo size={48} />
        </View>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Text style={styles.sectionLabel}>{t('settings.onThisPhone')}</Text>

        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/computers')}>
            <Text style={styles.rowLabel}>{t('settings.computers')}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{computer?.name ?? '—'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.midGray} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/offline-queue')}>
            <Text style={styles.rowLabel}>{t('settings.offlineQueue')}</Text>
            <View style={styles.rowRight}>
              {offlineCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{offlineCount}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.midGray} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => void toggleLanguage()}>
            <Text style={styles.rowLabel}>{t('settings.language')}</Text>
            <Text style={styles.rowValue}>
              {language === 'pt-BR' ? t('settings.languageValue') : 'English'}
            </Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Toggle
              value={backgroundRecord}
              onValueChange={setBackgroundRecord}
              label={t('settings.backgroundRecord')}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.deleteAudio')}</Text>
            <Text style={styles.rowValue}>{t('settings.deleteAudioValue')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Toggle
              value={biometrics}
              onValueChange={setBiometrics}
              label={t('settings.biometrics')}
            />
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/onboarding/microphone')}
          >
            <Text style={styles.rowLabel}>{t('settings.microphone')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.midGray} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/recording-reconnect')}
          >
            <Text style={styles.rowLabel}>{t('settings.diagnostics')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.midGray} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings.about')}</Text>
            <Text style={styles.rowValue}>Handy Remote</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {t('settings.version', {
                version: Constants.expoConfig?.version ?? '0.1.0',
              })}
            </Text>
          </View>
        </View>

        {computer ? (
          <TouchableOpacity style={styles.disconnectBtn} onPress={() => void handleDisconnect()}>
            <Text style={styles.disconnectText}>{t('settings.disconnect')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.backgroundAlt },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  brandRow: { marginBottom: spacing.sm },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  toggleRow: {
    paddingHorizontal: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowValue: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.white,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  disconnectBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  disconnectText: {
    color: colors.error,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
