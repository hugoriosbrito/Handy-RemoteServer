import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { spacing, radius, typography, type ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { api } from '@/api/client';
import { useConnectionStore } from '@/stores/connectionStore';

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setPendingFromQr = useConnectionStore((s) => s.setPendingFromQr);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // expo-camera can end up with a torn-down (black) preview after the screen
  // loses focus, the app is backgrounded, or a scan error. Fully unmount the
  // CameraView in those states and remount a fresh one — with a changing `key`
  // — so the native camera session is always recreated cleanly.
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const [cameraKey, setCameraKey] = useState(0);
  const wasLiveRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  const cameraLive = isFocused && appActive;

  // Force a fresh CameraView instance on every transition back to "live".
  useEffect(() => {
    if (cameraLive && !wasLiveRef.current) {
      setCameraKey((k) => k + 1);
      setScanned(false);
    }
    wasLiveRef.current = cameraLive;
  }, [cameraLive]);

  const applyPayload = (raw: string) => {
    try {
      const qr = api.parseQrPayload(raw.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setError(null);
      setPendingFromQr(qr);
      setManualOpen(false);
      router.push('/pair/confirm');
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(t('pair.invalidQr'));
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    applyPayload(data);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setManualText(text);
    } catch {
      // ignore clipboard errors
    }
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
          {cameraLive ? (
            <CameraView
              key={cameraKey}
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
          ) : (
            <View style={[styles.camera, styles.cameraPlaceholder]}>
              <Ionicons name="camera-outline" size={36} color={colors.midGray} />
            </View>
          )}
          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={styles.frame}>
              <Ionicons name="camera" size={28} color={colors.primary} />
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <Text style={styles.pointHint}>{t('pair.scanPoint')}</Text>
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            setError(null);
            setManualOpen(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>{t('pair.enterCode')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={manualOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
              autoFocus
            />
            <TouchableOpacity
              style={styles.pasteBtn}
              onPress={() => void pasteFromClipboard()}
              accessibilityRole="button"
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
              <Text style={styles.pasteText}>{t('pair.paste')}</Text>
            </TouchableOpacity>
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
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const FRAME_SIZE = 240;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.md,
    fontSize: typography.sizes.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginVertical: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  pasteText: {
    color: colors.primary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
