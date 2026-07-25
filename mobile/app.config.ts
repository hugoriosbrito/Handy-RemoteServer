import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Remote Companion",
  slug: "remote-companion",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/remote-companion-icon.png",
  scheme: "handy-remote",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  backgroundColor: "#0F0F11",
  splash: {
    image: "./assets/remote-companion-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0F0F11",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.handy.remote",
    infoPlist: {
      NSCameraUsageDescription:
        "Remote Companion precisa da câmera para escanear o QR Code do computador.",
      NSMicrophoneUsageDescription:
        "Remote Companion precisa do microfone para gravar e transcrever áudio.",
      NSLocalNetworkUsageDescription:
        "Remote Companion precisa da rede local para conectar ao computador na mesma Wi‑Fi.",
      // Remote server speaks HTTP on the LAN — allow local cleartext.
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
      // Allow audio capture to continue while the app is backgrounded.
      UIBackgroundModes: ["audio"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/remote-companion-icon.png",
      backgroundColor: "#0F0F11",
    },
    package: "com.handy.remote",
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "CAMERA",
      "RECORD_AUDIO",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MICROPHONE",
      "POST_NOTIFICATIONS",
      "WAKE_LOCK",
    ],
  },
  plugins: [
    "expo-router",
    [
      "expo-camera",
      {
        cameraPermission:
          "Remote Companion precisa da câmera para escanear o QR Code do computador.",
      },
    ],
    [
      "expo-av",
      {
        microphonePermission:
          "Remote Companion precisa do microfone para gravar e transcrever áudio.",
      },
    ],
    [
      "expo-build-properties",
      {
        // Handy remote API is HTTP on the LAN (not HTTPS).
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
    // Declares the microphone foreground-service type for background recording.
    "./plugins/withBackgroundMicrophone",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...config.extra,
    eas: {
      projectId: "fa7f3df6-b59b-44d6-906e-a5d5ceb5a44b",
    },
  },
  owner: "hugorios25",
});
