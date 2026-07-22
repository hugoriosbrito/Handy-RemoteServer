import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'handy_auth_token';
const COMPUTER_KEY = 'handy_computer';

export interface Computer {
  id: string;
  name: string;
  lastSeen: string;
  isOnline: boolean;
}

interface ConnectionState {
  token: string | null;
  computer: Computer | null;
  computers: Computer[];
  pairingCode: string;
  isConnecting: boolean;
  isReconnecting: boolean;
  setPairingCode: (code: string) => void;
  setConnecting: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  connect: (token: string, computer: Computer) => Promise<void>;
  disconnect: () => Promise<void>;
  loadPersisted: () => Promise<void>;
  addComputer: (computer: Computer) => void;
  removeComputer: (id: string) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  token: null,
  computer: null,
  computers: [
    {
      id: 'comp-1',
      name: 'MacBook Pro',
      lastSeen: new Date().toISOString(),
      isOnline: true,
    },
    {
      id: 'comp-2',
      name: 'Desktop Linux',
      lastSeen: new Date(Date.now() - 3600000).toISOString(),
      isOnline: false,
    },
  ],
  pairingCode: '482916',
  isConnecting: false,
  isReconnecting: false,

  setPairingCode: (code) => set({ pairingCode: code }),
  setConnecting: (v) => set({ isConnecting: v }),
  setReconnecting: (v) => set({ isReconnecting: v }),

  connect: async (token, computer) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(COMPUTER_KEY, JSON.stringify(computer));
    set({ token, computer });
  },

  disconnect: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(COMPUTER_KEY);
    set({ token: null, computer: null });
  },

  loadPersisted: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const computerJson = await SecureStore.getItemAsync(COMPUTER_KEY);
      if (token && computerJson) {
        const computer = JSON.parse(computerJson) as Computer;
        set({ token, computer });
      }
    } catch {
      // ignore
    }
  },

  addComputer: (computer) =>
    set((s) => ({ computers: [...s.computers, computer] })),

  removeComputer: (id) =>
    set((s) => ({
      computers: s.computers.filter((c) => c.id !== id),
      computer: s.computer?.id === id ? null : s.computer,
    })),
}));
