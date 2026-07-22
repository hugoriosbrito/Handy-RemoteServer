import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Card } from '@/components/ui';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n, { setStoredLanguage } from '@/i18n';

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  trailing?: unknown;
}

function SettingsRow({ icon, label, onPress, trailing }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {(trailing ?? (onPress ? (
        <Ionicons name="chevron-forward" size={20} color={colors.midGray} />
      ) : null)) as never}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const disconnect = useConnectionStore((s) => s.disconnect);
  const computer = useConnectionStore((s) => s.computer);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const offlineCount = 1;

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
        <Text style={styles.title}>{t('settings.title')}</Text>

        {computer && (
          <Card variant="soft" style={styles.connectedCard}>
            <View style={styles.connectedRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.connectedText}>
                {t('record.connectedTo', { name: computer.name })}
              </Text>
            </View>
          </Card>
        )}

        <Card style={styles.section}>
          <SettingsRow
            icon="desktop-outline"
            label={t('settings.computers')}
            onPress={() => router.push('/computers')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="cloud-upload-outline"
            label={t('settings.offlineQueue')}
            onPress={() => router.push('/offline-queue')}
            trailing={
              offlineCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{offlineCount}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.midGray} />
              )
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="language-outline"
            label={t('settings.language')}
            onPress={toggleLanguage}
            trailing={
              <Text style={styles.langValue}>
                {language === 'pt-BR' ? 'Português' : 'English'}
              </Text>
            }
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="mic-outline"
            label={t('settings.microphone')}
            onPress={() => router.push('/onboarding/microphone')}
          />
        </Card>

        <Card style={styles.section}>
          <SettingsRow icon="information-circle-outline" label={t('settings.about')} />
          <View style={styles.divider} />
          <SettingsRow
            icon="code-slash-outline"
            label={t('settings.version', {
              version: Constants.expoConfig?.version ?? '0.1.0',
            })}
          />
        </Card>

        {computer && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>{t('settings.disconnect')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.devLink}
          onPress={() => router.push('/recording-reconnect')}
        >
          <Text style={styles.devLinkText}>Dev: Reconnect screen</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  connectedCard: {
    marginBottom: spacing.md,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectedText: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  section: {
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 52,
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
  langValue: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
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
  devLink: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  devLinkText: {
    fontSize: typography.sizes.xs,
    color: colors.midGray,
  },
});
