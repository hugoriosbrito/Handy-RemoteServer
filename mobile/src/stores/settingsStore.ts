import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'handy_settings';

export interface AppSettings {
  postProcessEnabled: boolean;
  microphoneGranted: boolean;
  language: 'pt-BR' | 'en';
  hasCompletedOnboarding: boolean;
  backgroundRecord: boolean;
  biometrics: boolean;
}

interface SettingsState extends AppSettings {
  loaded: boolean;
  setPostProcess: (v: boolean) => void;
  setMicrophoneGranted: (v: boolean) => void;
  setLanguage: (lang: 'pt-BR' | 'en') => void;
  setOnboardingComplete: (v: boolean) => void;
  setBackgroundRecord: (v: boolean) => void;
  setBiometrics: (v: boolean) => void;
  loadSettings: () => Promise<void>;
  persist: () => Promise<void>;
}

const defaults: AppSettings = {
  postProcessEnabled: false,
  microphoneGranted: false,
  language: 'pt-BR',
  hasCompletedOnboarding: false,
  backgroundRecord: false,
  biometrics: false,
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

  setBackgroundRecord: (v) => {
    set({ backgroundRecord: v });
    void get().persist();
  },

  setBiometrics: (v) => {
    set({ biometrics: v });
    void get().persist();
  },

  loadSettings: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        set({ ...defaults, ...parsed, loaded: true });
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
      backgroundRecord,
      biometrics,
    } = get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({
          postProcessEnabled,
          microphoneGranted,
          language,
          hasCompletedOnboarding,
          backgroundRecord,
          biometrics,
        }),
      );
    } catch {
      // ignore
    }
  },
}));
