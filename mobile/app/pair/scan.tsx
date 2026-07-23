import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { colors, spacing, radius, typography } from '@/theme/tokens';
import { api } from '@/api/client';
import { useConnectionStore } from '@/stores/connectionStore';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const setPendingFromQr = useConnectionStore((s) => s.setPendingFromQr);

  const applyPayload = (raw: string) => {
    try {
      const qr = api.parseQrPayload(raw.trim());
      setPendingFromQr(qr);
      setManualOpen(false);
      router.push('/pair/confirm');
    } catch {
      Alert.alert(t('pair.scanTitle'), t('pair.invalidQr'));
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    applyPayload(data);
  };

  if (!permission) {
    return <View style={styles.safe} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionBox}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('pair.scanTitle')}</Text>
          <Text style={styles.subtitle}>{t('pair.cameraPermission')}</Text>
          <Button title={t('pair.allowCamera')} onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('pair.scanTitle')}</Text>
            <Text style={styles.subtitle}>{t('pair.scanHint')}</Text>
          </View>
        </View>

        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={styles.frame}>
              <Ionicons name="camera" size={28} color={colors.primary} />
            </View>
          </View>
        </View>

        <Text style={styles.pointHint}>{t('pair.scanPoint')}</Text>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setManualOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>{t('pair.enterCode')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={manualOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('pair.enterCodeTitle')}</Text>
            <Text style={styles.modalHint}>{t('pair.enterCodeHint')}</Text>
            <TextInput
              style={styles.modalInput}
              value={manualText}
              onChangeText={setManualText}
              placeholder={t('pair.manualEndpoint')}
              placeholderTextColor={colors.midGray}
              autoCapitalize="none"
              multiline
            />
            <Button
              title={t('common.confirm')}
              onPress={() => applyPayload(manualText)}
              disabled={!manualText.trim()}
            />
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => setManualOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  permissionBox: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  headerText: { flex: 1, paddingTop: spacing.sm },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  cameraWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.lg,
    backgroundColor: colors.overlay,
  },
  camera: { flex: 1 },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.md,
    fontSize: typography.sizes.sm,
  },
  secondaryBtn: {
    backgroundColor: '#F2F2F2',
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  modalHint: { color: colors.textSecondary, marginBottom: spacing.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
    color: colors.text,
    marginBottom: spacing.sm,
  },
});
