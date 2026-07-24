import { create } from "zustand";
// UI/UX audit: audio retention setting
import * as SecureStore from "expo-secure-store";

const SETTINGS_KEY = "handy_settings";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  postProcessEnabled: boolean;
  microphoneGranted: boolean;
  language: "pt-BR" | "en";
  hasCompletedOnboarding: boolean;
  biometrics: boolean;
  themeMode: ThemeMode;
  audioRetentionHours: AudioRetentionHours;
  recordingSoundsEnabled: boolean;
}
export type AudioRetentionHours = 1 | 24 | 168 | -1;

interface SettingsState extends AppSettings {
  loaded: boolean;
  setPostProcess: (v: boolean) => void;
  setMicrophoneGranted: (v: boolean) => void;
  setLanguage: (lang: "pt-BR" | "en") => void;
  setOnboardingComplete: (v: boolean) => void;
  setBiometrics: (v: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAudioRetention: (hours: AudioRetentionHours) => void;
  setRecordingSoundsEnabled: (v: boolean) => void;
  loadSettings: () => Promise<void>;
  persist: () => Promise<void>;
}

const defaults: AppSettings = {
  postProcessEnabled: false,
  microphoneGranted: false,
  language: "pt-BR",
  hasCompletedOnboarding: false,
  biometrics: false,
  // Explicit light by default — do not follow the OS dark mode automatically.
  themeMode: "light",
  audioRetentionHours: 24,
  recordingSoundsEnabled: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  setPostProcess: (v) => {
    set({ postProcessEnabled: v });
    void get().persist();
  },

  setMicrophoneGranted: (v) => {
    set({ microphoneGranted: v });
    void get().persist();
  },

  setLanguage: (lang) => {
    set({ language: lang });
    void get().persist();
  },

  setOnboardingComplete: (v) => {
    set({ hasCompletedOnboarding: v });
    void get().persist();
  },

  setBiometrics: (v) => {
    set({ biometrics: v });
    void get().persist();
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void get().persist();
  },
  setAudioRetention: (hours) => {
    set({ audioRetentionHours: hours });
    void get().persist();
  },

  setRecordingSoundsEnabled: (v) => {
    set({ recordingSoundsEnabled: v });
    void get().persist();
  },

  loadSettings: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        // Migrate legacy "system" so dark mode is never applied silently.
        const themeMode =
          parsed.themeMode === "system" || !parsed.themeMode
            ? "light"
            : parsed.themeMode;
        set({ ...defaults, ...parsed, themeMode, loaded: true });
        if (parsed.themeMode === "system") {
          // Persist the migration so the toggle stays in sync next launch.
          void get().persist();
        }
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  persist: async () => {
    const {
      postProcessEnabled,
      microphoneGranted,
      language,
      hasCompletedOnboarding,
      biometrics,
      themeMode,
      audioRetentionHours,
    recordingSoundsEnabled,
    } = get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({
          postProcessEnabled,
          microphoneGranted,
          language,
          hasCompletedOnboarding,
          biometrics,
          themeMode,
          audioRetentionHours,
        recordingSoundsEnabled,
        }),
      );
    } catch {
      // ignore
    }
  },
}));
