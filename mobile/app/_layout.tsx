import "react-native-gesture-handler";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/i18n";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRecordingStore } from "@/stores/recordingStore";
import { BiometricGate } from "@/components/BiometricGate";
import { ThemeProvider, useThemeInfo } from "@/theme/ThemeProvider";
import { probeServerHealth, reconnectBestEndpoint } from "@/lib/connection";
import i18n from "@/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnReconnect: true,
    },
  },
});

const HEALTH_POLL_MS = 20_000;

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppBootstrap() {
  const loadPersisted = useConnectionStore((s) => s.loadPersisted);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadQueue = useRecordingStore((s) => s.loadQueue);
  const language = useSettingsStore((s) => s.language);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    void loadPersisted();
    void loadSettings();
    void loadQueue().then(() => {
      // Enforce the audio retention window on startup once the queue is loaded.
      const { audioRetentionHours } = useSettingsStore.getState();
      void useRecordingStore.getState().pruneExpiredQueue(audioRetentionHours);
    });
  }, [loadPersisted, loadSettings, loadQueue]);

  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Keep isOnline fresh while paired — avoids stale "offline" badges.
  useEffect(() => {
    if (!token || !baseUrl) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      // Don't hammer health while actively recording.
      const status = useRecordingStore.getState().status;
      if (
        status === "recording" ||
        status === "paused" ||
        status === "processing"
      ) {
        return;
      }
      // If the active URL is unreachable, fail over to other advertised
      // endpoints (mDNS/tailscale) — recovers after the PC's IP changed.
      if (!(await probeServerHealth(baseUrl))) {
        if (cancelled) return;
        await reconnectBestEndpoint();
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, HEALTH_POLL_MS);

    const onAppState = (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        // Coming back to the foreground: actively re-probe every endpoint so a
        // PC that moved to a new IP while we were away reconnects on its own.
        void reconnectBestEndpoint();
        void queryClient.invalidateQueries({ queryKey: ["history"] });
      }
      appState.current = next;
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [token, baseUrl]);

  return null;
}

function ThemedApp() {
  const { colors, scheme } = useThemeInfo();
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(
      () => undefined,
    );
  }, [colors.background]);

  useEffect(() => {
    if (!settingsLoaded) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [settingsLoaded]);

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <BiometricGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="pair/scan" />
          <Stack.Screen name="pair/confirm" />
          <Stack.Screen name="pair/inject" />
          <Stack.Screen name="onboarding/microphone" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="recording"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="recording-reconnect"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen name="result" />
          <Stack.Screen name="computers" />
          <Stack.Screen name="models" />
          <Stack.Screen name="offline-queue" />
          <Stack.Screen name="diagnostics" />
        </Stack>
      </BiometricGate>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppBootstrap />
          <ThemedApp />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
