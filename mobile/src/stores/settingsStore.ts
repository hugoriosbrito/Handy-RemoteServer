import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'handy_settings';

export interface AppSettings {
  postProcessEnabled: boolean;
  microphoneGranted: boolean;
  language: 'pt-BR' | 'en';
  hasCompletedOnboarding: boolean;
}

interface SettingsState extends AppSettings {
  loaded: boolean;
  setPostProcess: (v: boolean) => void;
  setMicrophoneGranted: (v: boolean) => void;
  setLanguage: (lang: 'pt-BR' | 'en') => void;
  setOnboardingComplete: (v: boolean) => void;
  loadSettings: () => Promise<void>;
  persist: () => Promise<void>;
}

const defaults: AppSettings = {
  postProcessEnabled: false,
  microphoneGranted: false,
  language: 'pt-BR',
  hasCompletedOnboarding: false,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  setPostProcess: (v) => {
    set({ postProcessEnabled: v });
    get().persist();
  },

  setMicrophoneGranted: (v) => {
    set({ microphoneGranted: v });
    get().persist();
  },

  setLanguage: (lang) => {
    set({ language: lang });
    get().persist();
  },

  setOnboardingComplete: (v) => {
    set({ hasCompletedOnboarding: v });
    get().persist();
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
    const { postProcessEnabled, microphoneGranted, language, hasCompletedOnboarding } =
      get();
    try {
      await SecureStore.setItemAsync(
        SETTINGS_KEY,
        JSON.stringify({ postProcessEnabled, microphoneGranted, language, hasCompletedOnboarding }),
      );
    } catch {
      // ignore
    }
  },
}));
