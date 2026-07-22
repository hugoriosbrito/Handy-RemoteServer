import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/i18n';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import i18n from '@/i18n';

const queryClient = new QueryClient();

function AppBootstrap() {
  const loadPersisted = useConnectionStore((s) => s.loadPersisted);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    loadPersisted();
    loadSettings();
  }, [loadPersisted, loadSettings]);

  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppBootstrap />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FFFFFF' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="pair/scan" />
          <Stack.Screen name="pair/confirm" />
          <Stack.Screen name="onboarding/microphone" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="recording"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="recording-reconnect"
            options={{ presentation: 'fullScreenModal' }}
          />
          <Stack.Screen name="result" />
          <Stack.Screen name="computers" />
          <Stack.Screen name="offline-queue" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
