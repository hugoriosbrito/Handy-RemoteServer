import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Handy Remote',
  slug: 'handy-remote',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'handy-remote',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#da5893',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.handy.remote',
    infoPlist: {
      NSCameraUsageDescription:
        'Handy Remote precisa da câmera para escanear o QR Code do computador.',
      NSMicrophoneUsageDescription:
        'Handy Remote precisa do microfone para gravar e transcrever áudio.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#da5893',
    },
    package: 'com.handy.remote',
    permissions: ['CAMERA', 'RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'Handy Remote precisa da câmera para escanear o QR Code do computador.',
      },
    ],
    [
      'expo-av',
      {
        microphonePermission:
          'Handy Remote precisa do microfone para gravar e transcrever áudio.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
