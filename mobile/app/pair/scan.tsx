import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenHeader } from '@/components/ui';
import { colors, spacing, radius, typography } from '@/theme/tokens';
import { api } from '@/api/client';
import { useConnectionStore } from '@/stores/connectionStore';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const setPendingFromQr = useConnectionStore((s) => s.setPendingFromQr);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const qr = api.parseQrPayload(data);
      setPendingFromQr(qr);
      router.push('/pair/confirm');
    } catch {
      setScanned(false);
      Alert.alert(
        t('pair.scanTitle'),
        t('pair.invalidQr', {
          defaultValue: 'QR Code inválido. Escaneie o código exibido no Handy.',
        }),
      );
    }
  };

  const handleEnterCode = () => {
    Alert.alert(
      t('pair.enterCode'),
      t('pair.codeRequiresQr', {
        defaultValue:
          'O código de 6 dígitos é para verificação no computador. Escaneie o QR Code para iniciar o pareamento.',
      }),
    );
  };

  if (!permission) {
    return <View style={styles.safe} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionBox}>
          <ScreenHeader
            title={t('pair.scanTitle')}
            subtitle={t('pair.cameraPermission', {
              defaultValue: 'Permissão de câmera necessária para escanear o QR Code.',
            })}
          />
          <Button
            title={t('pair.allowCamera', { defaultValue: 'Permitir câmera' })}
            onPress={requestPermission}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <ScreenHeader title={t('pair.scanTitle')} subtitle={t('pair.scanHint')} />

        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.frameOverlay}>
            <View style={styles.frame} />
          </View>
        </View>

        <TouchableOpacity onPress={handleEnterCode} style={styles.linkBtn}>
          <Text style={styles.linkText}>{t('pair.enterCode')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  permissionBox: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  backBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  cameraWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginVertical: spacing.lg,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  linkText: {
    color: colors.primary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
