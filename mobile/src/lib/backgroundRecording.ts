import { PermissionsAndroid, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The task itself does nothing useful — its only job is to keep the Android
 * foreground service (and therefore the JS runtime, expo-av mic capture, and the
 * chunk-rotation timers) alive while the screen is off / the app is backgrounded.
 * It exits once `stop()` flips `isRunning()` to false.
 */
const keepAliveTask = async () => {
  while (BackgroundService.isRunning()) {
    await sleep(1000);
  }
};

/**
 * Start a microphone foreground service so recording continues in the background.
 * Returns true when background capture is available (always true on iOS, which
 * uses UIBackgroundModes instead). Returns false if the service can't start, so
 * callers can fall back to pausing.
 */
export async function startBackgroundRecording(
  title: string,
  desc: string,
): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (BackgroundService.isRunning()) return true;
    // Android 13+ requires an explicit runtime grant before a foreground-service
    // notification can appear. Without it, start() fails silently / is blocked.
    if (typeof PermissionsAndroid?.PERMISSIONS?.POST_NOTIFICATIONS === 'string') {
      const current = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (!current) {
        const asked = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (asked !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[backgroundRecording] POST_NOTIFICATIONS denied');
          return false;
        }
      }
    }
    await BackgroundService.start(keepAliveTask, {
      taskName: 'HandyRecording',
      taskTitle: title,
      taskDesc: desc,
      taskIcon: { name: 'ic_launcher', type: 'mipmap' },
      color: '#da5893',
      linkingURI: 'handy-remote://recording',
      foregroundServiceType: ['microphone'],
    });
    return true;
  } catch (e) {
    console.warn('[backgroundRecording] failed to start FGS', e);
    return false;
  }
}

export async function stopBackgroundRecording(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (BackgroundService.isRunning()) await BackgroundService.stop();
  } catch {
    // ignore
  }
}

/** Whether the background recording service is currently keeping us alive. */
export function isBackgroundRecordingActive(): boolean {
  if (Platform.OS !== 'android') return true;
  try {
    return BackgroundService.isRunning();
  } catch {
    return false;
  }
}
