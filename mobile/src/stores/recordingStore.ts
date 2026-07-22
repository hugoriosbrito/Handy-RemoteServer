import { create } from 'zustand';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing';

export interface OfflineQueueItem {
  id: string;
  createdAt: string;
  durationMs: number;
  status: 'pending' | 'uploading' | 'failed';
}

interface RecordingState {
  status: RecordingStatus;
  elapsedMs: number;
  liveText: string;
  lastTranscription: string | null;
  lastDurationMs: number;
  offlineQueue: OfflineQueueItem[];
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  cancel: () => void;
  tick: (ms: number) => void;
  setLiveText: (text: string) => void;
  addToOfflineQueue: (item: OfflineQueueItem) => void;
  removeFromOfflineQueue: (id: string) => void;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  status: 'idle',
  elapsedMs: 0,
  liveText: '',
  lastTranscription: null,
  lastDurationMs: 0,
  offlineQueue: [
    {
      id: 'q1',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      durationMs: 15400,
      status: 'pending',
    },
  ],

  start: () =>
    set({ status: 'recording', elapsedMs: 0, liveText: 'Olá, estou gravando uma nota de voz…' }),

  pause: () => set({ status: 'paused' }),

  resume: () => set({ status: 'recording' }),

  stop: () => {
    const { elapsedMs, liveText } = get();
    set({
      status: 'idle',
      lastTranscription:
        liveText ||
        'Esta é a transcrição finalizada. O texto foi processado pelo Handy no computador.',
      lastDurationMs: elapsedMs || 12500,
      liveText: '',
      elapsedMs: 0,
    });
  },

  cancel: () => set({ status: 'idle', elapsedMs: 0, liveText: '' }),

  tick: (ms) => set({ elapsedMs: ms }),

  setLiveText: (text) => set({ liveText: text }),

  addToOfflineQueue: (item) =>
    set((s) => ({ offlineQueue: [...s.offlineQueue, item] })),

  removeFromOfflineQueue: (id) =>
    set((s) => ({ offlineQueue: s.offlineQueue.filter((q) => q.id !== id) })),
}));

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
