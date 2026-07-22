import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Toggle, Card } from '@/components/ui';
import { HandyIcon } from '@/components/HandyLogo';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';

export default function RecordTabScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const postProcessEnabled = useSettingsStore((s) => s.postProcessEnabled);
  const setPostProcess = useSettingsStore((s) => s.setPostProcess);
  const computer = useConnectionStore((s) => s.computer);

  const handleStart = () => {
    router.push('/recording');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <HandyIcon size={36} />
          <Text style={styles.headerTitle}>{t('record.title')}</Text>
        </View>

        <Card variant="soft" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons
              name={computer ? 'checkmark-circle' : 'cloud-offline-outline'}
              size={22}
              color={computer ? colors.success : colors.warning}
            />
            <Text style={styles.statusText}>
              {computer
                ? t('record.connectedTo', { name: computer.name })
                : t('record.notConnected')}
            </Text>
          </View>
        </Card>

        <Card style={styles.toggleCard}>
          <Toggle
            value={postProcessEnabled}
            onValueChange={setPostProcess}
            label={t('record.postProcess')}
            hint={t('record.postProcessHint')}
          />
        </Card>

        <View style={styles.recordArea}>
          <View style={styles.micButtonOuter}>
            <View style={styles.micButtonInner}>
              <Ionicons name="mic" size={48} color={colors.white} />
            </View>
          </View>
          <Button
            title={t('record.startRecording')}
            onPress={handleStart}
            style={styles.startBtn}
          />
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  statusCard: {
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    flex: 1,
  },
  toggleCard: {
    marginBottom: spacing.lg,
  },
  recordArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  micButtonOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.codeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: {
    width: '100%',
  },
});
