import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'handy_offline_queue';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing';

export interface OfflineQueueItem {
  id: string;
  createdAt: string;
  durationMs: number;
  uri: string;
  sizeBytes?: number;
  status: 'pending' | 'uploading' | 'failed';
  error?: string;
}

interface RecordingState {
  status: RecordingStatus;
  elapsedMs: number;
  liveText: string;
  lastTranscription: string | null;
  lastDurationMs: number;
  lastAudioUri: string | null;
  lastModel: string | null;
  lastPostProcessed: boolean;
  offlineQueue: OfflineQueueItem[];
  setStatus: (status: RecordingStatus) => void;
  setElapsed: (ms: number) => void;
  setLiveText: (text: string) => void;
  setResult: (result: {
    text: string;
    durationMs: number;
    audioUri?: string | null;
    model?: string | null;
    postProcessed?: boolean;
  }) => void;
  resetSession: () => void;
  loadQueue: () => Promise<void>;
  persistQueue: () => Promise<void>;
  addToOfflineQueue: (item: OfflineQueueItem) => void;
  updateQueueItem: (id: string, patch: Partial<OfflineQueueItem>) => void;
  removeFromOfflineQueue: (id: string) => void;
}

async function writeQueue(items: OfflineQueueItem[]) {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  status: 'idle',
  elapsedMs: 0,
  liveText: '',
  lastTranscription: null,
  lastDurationMs: 0,
  lastAudioUri: null,
  lastModel: null,
  lastPostProcessed: false,
  offlineQueue: [],

  setStatus: (status) => set({ status }),
  setElapsed: (ms) => set({ elapsedMs: ms }),
  setLiveText: (text) => set({ liveText: text }),

  setResult: ({ text, durationMs, audioUri, model, postProcessed }) =>
    set({
      status: 'idle',
      lastTranscription: text,
      lastDurationMs: durationMs,
      lastAudioUri: audioUri ?? null,
      lastModel: model ?? null,
      lastPostProcessed: Boolean(postProcessed),
      liveText: '',
      elapsedMs: 0,
    }),

  resetSession: () =>
    set({
      status: 'idle',
      elapsedMs: 0,
      liveText: '',
    }),

  loadQueue: async () => {
    try {
      const raw = await SecureStore.getItemAsync(QUEUE_KEY);
      if (!raw) {
        set({ offlineQueue: [] });
        return;
      }
      set({ offlineQueue: JSON.parse(raw) as OfflineQueueItem[] });
    } catch {
      set({ offlineQueue: [] });
    }
  },

  persistQueue: async () => {
    await writeQueue(get().offlineQueue);
  },

  addToOfflineQueue: (item) => {
    const offlineQueue = [...get().offlineQueue, item];
    set({ offlineQueue });
    void writeQueue(offlineQueue);
  },

  updateQueueItem: (id, patch) => {
    const offlineQueue = get().offlineQueue.map((q) =>
      q.id === id ? { ...q, ...patch } : q,
    );
    set({ offlineQueue });
    void writeQueue(offlineQueue);
  },

  removeFromOfflineQueue: (id) => {
    const offlineQueue = get().offlineQueue.filter((q) => q.id !== id);
    set({ offlineQueue });
    void writeQueue(offlineQueue);
  },
}));

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
