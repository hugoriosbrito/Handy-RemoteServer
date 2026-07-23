import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Button } from '@/components/ui';
import { spacing, typography, radius, shadows, type ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { probeServerHealth } from '@/lib/connection';

// Read-only connection diagnostics. Opening this screen must not mutate any
// state on its own -- the only network call happens when the user taps
// "Test connection".
export default function DiagnosticsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const computer = useConnectionStore((s) => s.computer);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const endpoints = useConnectionStore((s) => s.endpoints);
  const queueCount = useRecordingStore((s) => s.offlineQueue.length);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const runTest = async () => {
    if (!baseUrl) {
      setTestResult('fail');
      return;
    }
    setTesting(true);
    setTestResult(null);
    const ok = await probeServerHealth(baseUrl);
    setTestResult(ok ? 'ok' : 'fail');
    setTesting(false);
  };

  const isOnline = Boolean(computer?.isOnline);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>{t('diagnostics.title')}</Text>
        <Text style={styles.subtitle}>{t('diagnostics.subtitle')}</Text>

        {computer ? (
          <View style={styles.card}>
            <Row label={t('diagnostics.computer')} value={computer.name} styles={styles} />
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('diagnostics.status')}</Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isOnline ? colors.success : colors.midGray },
                  ]}
                />
                <Text style={[styles.rowValue, { color: isOnline ? colors.success : colors.midGray }]}>
                  {isOnline ? t('diagnostics.online') : t('diagnostics.offline')}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <Row
              label={t('diagnostics.activeEndpoint')}
              value={baseUrl ?? t('diagnostics.none')}
              mono
              styles={styles}
            />
            <View style={styles.divider} />
            <Row
              label={t('diagnostics.queue')}
              value={t('diagnostics.queueItems', { count: queueCount })}
              styles={styles}
            />
            <View style={styles.divider} />
            <Row
              label={t('diagnostics.version')}
              value={Constants.expoConfig?.version ?? '0.1.0'}
              styles={styles}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rowValue}>{t('diagnostics.notPaired')}</Text>
          </View>
        )}

        {endpoints.length > 1 ? (
          <View style={styles.card}>
            <Text style={styles.rowLabel}>{t('diagnostics.endpoints')}</Text>
            {endpoints.map((url) => (
              <Text key={url} style={styles.endpoint}>
                {url}
              </Text>
            ))}
          </View>
        ) : null}

        {testResult ? (
          <Text style={[styles.testResult, { color: testResult === 'ok' ? colors.success : colors.error }]}>
            {testResult === 'ok' ? t('diagnostics.reachable') : t('diagnostics.unreachable')}
          </Text>
        ) : null}

        <Button
          title={testing ? t('diagnostics.testing') : t('diagnostics.testConnection')}
          onPress={() => void runTest()}
          disabled={testing || !baseUrl}
          style={styles.testBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  mono,
  styles,
}: {
  label: string;
  value: string;
  mono?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    backBtn: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      width: 40,
      height: 40,
      justifyContent: 'center',
    },
    title: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    subtitle: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    rowLabel: {
      fontSize: typography.sizes.md,
      color: colors.text,
    },
    rowValue: {
      flexShrink: 1,
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      textAlign: 'right',
    },
    mono: {
      fontVariant: ['tabular-nums'],
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    divider: {
      height: 1,
      backgroundColor: colors.border,
    },
    endpoint: {
      fontSize: typography.sizes.sm,
      color: colors.midGray,
      paddingVertical: spacing.xs,
    },
    testResult: {
      fontSize: typography.sizes.sm,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    testBtn: {
      marginTop: spacing.sm,
    },
  });
