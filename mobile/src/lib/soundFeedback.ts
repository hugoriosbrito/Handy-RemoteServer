import { Audio } from "expo-av";

import { api } from "@/api/client";

import { useSettingsStore } from "@/stores/settingsStore";

type FeedbackKind = "start" | "stop";

let cachedTheme: "marimba" | "pop" | "custom" = "marimba";

let cachedEnabled = true;

let lastFetchAt = 0;

const SOUND_ASSETS: Record<"marimba" | "pop", Record<FeedbackKind, number>> = {
  marimba: {
    start: require("../../assets/sounds/marimba_start.wav"),

    stop: require("../../assets/sounds/marimba_stop.wav"),
  },

  pop: {
    start: require("../../assets/sounds/pop_start.wav"),

    stop: require("../../assets/sounds/pop_stop.wav"),
  },
};

export async function loadDesktopFeedbackSettings(
  token?: string | null,

  baseUrl?: string | null,
): Promise<void> {
  if (!token) return;

  // Avoid hammering /v1/settings on every record start.

  if (Date.now() - lastFetchAt < 15_000) return;

  try {
    const settings = await api.getClientSettings(token, baseUrl ?? undefined);

    cachedTheme =
      settings.soundTheme === "pop" || settings.soundTheme === "custom"
        ? settings.soundTheme
        : "marimba";

    cachedEnabled = settings.audioFeedback;

    lastFetchAt = Date.now();
  } catch {
    // Keep the last known theme/feedback preference.
  }
}

export async function playFeedbackSound(kind: FeedbackKind): Promise<void> {
  const localEnabled = useSettingsStore.getState().recordingSoundsEnabled;

  if (!localEnabled || !cachedEnabled) return;

  const theme = cachedTheme === "custom" ? "marimba" : cachedTheme;

  const asset = SOUND_ASSETS[theme][kind];

  try {
    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: true,

      volume: 0.8,
    });

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;

      if (status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch {
    // Sound feedback is nice-to-have; never block recording.
  }
}
