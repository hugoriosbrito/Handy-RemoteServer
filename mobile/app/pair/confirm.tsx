import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, DeviceCard, ScreenHeader } from '@/components/ui';
import { colors, spacing, typography } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';
import { api } from '@/api/client';

const POLL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;

export default function ConfirmPairScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pending = useConnectionStore((s) => s.pendingPairing);
  const connect = useConnectionStore((s) => s.connect);
  const setConnecting = useConnectionStore((s) => s.setConnecting);
  const isConnecting = useConnectionStore((s) => s.isConnecting);
  const [error, setError] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const claimedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const finishWithCredentials = async (
    accessToken: string,
    refreshToken: string,
    deviceId: string,
    serverName: string,
    baseUrl: string,
  ) => {
    stopPolling();
    await connect(
      accessToken,
      {
        id: deviceId,
        name: serverName,
        lastSeen: new Date().toISOString(),
        isOnline: true,
      },
      { refreshToken, baseUrl },
    );
    setConnecting(false);
    router.replace('/onboarding/microphone');
  };

  const handleAuthorize = async () => {
    if (!pending) {
      setError(
        t('pair.missingQr', {
          defaultValue: 'Escaneie o QR Code do Handy antes de autorizar.',
        }),
      );
      return;
    }

    setConnecting(true);
    setError(null);
    setStatusHint(
      t('pair.claiming', { defaultValue: 'Solicitando autorização…' }),
    );
    claimedRef.current = false;

    try {
      const claim = await api.claimPairing(
        {
          sessionId: pending.sessionId,
          secret: pending.secret,
          deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android',
          platform: Platform.OS,
        },
        pending.baseUrl,
      );

      claimedRef.current = true;
      useConnectionStore.getState().setPendingPairing({
        ...pending,
        code: claim.code,
      });
      setStatusHint(
        t('pair.waitingApproval', {
          defaultValue:
            'Aguardando aprovação no computador. Confira o código {{code}}.',
          code: claim.code,
        }),
      );

      const startedAt = Date.now();
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            stopPolling();
            setConnecting(false);
            setError(
              t('pair.timeout', {
                defaultValue: 'Tempo esgotado. Tente escanear novamente.',
              }),
            );
            return;
          }

          const status = await api.getPairingStatus(
            pending.sessionId,
            pending.baseUrl,
          );

          if (status.status === 'approved' && status.credentials) {
            await finishWithCredentials(
              status.credentials.accessToken,
              status.credentials.refreshToken,
              status.credentials.deviceId,
              claim.serverName,
              pending.baseUrl,
            );
          } else if (status.status === 'rejected') {
            stopPolling();
            setConnecting(false);
            setError(
              t('pair.rejected', {
                defaultValue: 'Pareamento recusado no computador.',
              }),
            );
          } else if (status.status === 'expired') {
            stopPolling();
            setConnecting(false);
            setError(
              t('pair.expired', {
                defaultValue: 'Sessão expirada. Gere um novo QR no Handy.',
              }),
            );
          }
        } catch (e) {
          // Keep polling through transient network blips.
          console.warn('pairing poll failed', e);
        }
      }, POLL_MS);
    } catch (e) {
      setConnecting(false);
      setStatusHint(null);
      setError(
        e instanceof Error
          ? e.message
          : t('pair.failed', {
              defaultValue: 'Falha ao conectar. Tente novamente.',
            }),
      );
    }
  };

  const handleCancel = () => {
    stopPolling();
    setConnecting(false);
    router.back();
  };

  const displayName = pending?.serverName ?? '—';
  const displayCode = pending?.code || useConnectionStore.getState().pairingCode;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={handleCancel}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ScreenHeader
          title={t('pair.confirmTitle')}
          subtitle={t('pair.confirmSubtitle')}
        />

        <DeviceCard
          name={displayName}
          subtitle={pending?.baseUrl ?? 'handy-remote'}
          isOnline={Boolean(pending)}
          code={displayCode || undefined}
        />

        {statusHint ? <Text style={styles.hint}>{statusHint}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            title={
              isConnecting
                ? t('pair.waiting', { defaultValue: 'Aguardando…' })
                : t('pair.authorize')
            }
            onPress={handleAuthorize}
            loading={isConnecting}
            disabled={!pending || isConnecting}
          />
          <Button
            title={t('pair.cancel')}
            onPress={handleCancel}
            variant="ghost"
            style={styles.cancelBtn}
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
  },
  backBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  hint: {
    marginTop: spacing.md,
    color: colors.midGray,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.error,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
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
