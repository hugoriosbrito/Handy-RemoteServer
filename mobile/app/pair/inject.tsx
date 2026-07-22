import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors, spacing, typography } from '@/theme/tokens';

/**
 * Deep-link / automation entry: /pair/inject?payload=<urlencoded JSON QR>
 * Used by emulator E2E tests that cannot scan a physical QR code.
 */
export default function InjectPairScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();
  const setPendingFromQr = useConnectionStore((s) => s.setPendingFromQr);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!params.payload) {
        setError('Missing payload');
        return;
      }
      const raw = decodeURIComponent(String(params.payload));
      const qr = api.parseQrPayload(raw);
      setPendingFromQr(qr);
      router.replace('/pair/confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid payload');
    }
  }, [params.payload, router, setPendingFromQr]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.box}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.text}>Preparando pareamento…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: {
    color: colors.midGray,
    fontSize: typography.sizes.md,
  },
  error: {
    color: colors.error,
    fontSize: typography.sizes.md,
    textAlign: 'center',
  },
});
