import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, DeviceCard, ScreenHeader } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { api } from '@/api/client';

export default function ConfirmPairScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pairingCode = useConnectionStore((s) => s.pairingCode);
  const connect = useConnectionStore((s) => s.connect);
  const setConnecting = useConnectionStore((s) => s.setConnecting);
  const isConnecting = useConnectionStore((s) => s.isConnecting);
  const [error, setError] = useState<string | null>(null);

  const handleAuthorize = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await api.pairMock({
        code: pairingCode,
        deviceName: 'MacBook Pro',
      });
      await connect(result.token, {
        id: result.computerId,
        name: result.computerName,
        lastSeen: new Date().toISOString(),
        isOnline: true,
      });
      router.replace('/onboarding/microphone');
    } catch {
      setError('Falha ao conectar. Tente novamente.');
    } finally {
      setConnecting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ScreenHeader
          title={t('pair.confirmTitle')}
          subtitle={t('pair.confirmSubtitle')}
        />

        <DeviceCard
          name="MacBook Pro"
          subtitle="handy@macbook.local"
          isOnline
          code={pairingCode}
        />

        <View style={styles.actions}>
          <Button
            title={t('pair.authorize')}
            onPress={handleAuthorize}
            loading={isConnecting}
          />
          <Button
            title={t('pair.cancel')}
            onPress={handleCancel}
            variant="ghost"
            style={styles.cancelBtn}
          />
          {error && (
            <TouchableOpacity>
              {/* error placeholder — shown via button state */}
            </TouchableOpacity>
          )}
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
  },
  backBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  actions: {
    marginTop: 'auto',
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  cancelBtn: {
    marginTop: spacing.sm,
  },
});
