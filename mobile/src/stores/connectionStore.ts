import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { baseUrlFromQr, type QrPayload } from '@/api/client';

const TOKEN_KEY = 'handy_auth_token';
const REFRESH_KEY = 'handy_refresh_token';
const COMPUTER_KEY = 'handy_computer';
const BASE_URL_KEY = 'handy_base_url';

export interface Computer {
  id: string;
  name: string;
  lastSeen: string;
  isOnline: boolean;
}

export interface PendingPairing {
  sessionId: string;
  secret: string;
  code: string;
  serverName: string;
  fingerprint: string;
  baseUrl: string;
}

interface ConnectionState {
  token: string | null;
  refreshToken: string | null;
  baseUrl: string | null;
  computer: Computer | null;
  computers: Computer[];
  pairingCode: string;
  pendingPairing: PendingPairing | null;
  isConnecting: boolean;
  isReconnecting: boolean;
  setPairingCode: (code: string) => void;
  setPendingPairing: (pairing: PendingPairing | null) => void;
  setPendingFromQr: (qr: QrPayload, code?: string) => void;
  setConnecting: (v: boolean) => void;
  setReconnecting: (v: boolean) => void;
  connect: (
    token: string,
    computer: Computer,
    opts?: { refreshToken?: string; baseUrl?: string },
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  loadPersisted: () => Promise<void>;
  addComputer: (computer: Computer) => void;
  removeComputer: (id: string) => void;
}

async function persist(key: string, value: string | null) {
  try {
    if (value === null) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // SecureStore is unavailable on some web/dev environments — ignore.
  }
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  token: null,
  refreshToken: null,
  baseUrl: null,
  computer: null,
  computers: [],
  pairingCode: '',
  pendingPairing: null,
  isConnecting: false,
  isReconnecting: false,

  setPairingCode: (code) => set({ pairingCode: code }),

  setPendingPairing: (pairing) =>
    set({
      pendingPairing: pairing,
      pairingCode: pairing?.code ?? get().pairingCode,
    }),

  setPendingFromQr: (qr, code) => {
    const resolvedBaseUrl = baseUrlFromQr(qr);
    set({
      pendingPairing: {
        sessionId: qr.sessionId,
        secret: qr.secret,
        code: code ?? '',
        serverName: qr.serverName,
        fingerprint: qr.fingerprint,
        baseUrl: resolvedBaseUrl,
      },
      pairingCode: code ?? get().pairingCode,
      baseUrl: resolvedBaseUrl,
    });
  },

  setConnecting: (v) => set({ isConnecting: v }),
  setReconnecting: (v) => set({ isReconnecting: v }),

  connect: async (token, computer, opts) => {
    const nextBaseUrl = opts?.baseUrl ?? get().baseUrl;
    const refreshToken = opts?.refreshToken ?? get().refreshToken;
    await persist(TOKEN_KEY, token);
    await persist(COMPUTER_KEY, JSON.stringify(computer));
    if (refreshToken) await persist(REFRESH_KEY, refreshToken);
    if (nextBaseUrl) await persist(BASE_URL_KEY, nextBaseUrl);
    set((s) => ({
      token,
      computer,
      refreshToken: refreshToken ?? null,
      baseUrl: nextBaseUrl ?? null,
      computers: s.computers.some((c) => c.id === computer.id)
        ? s.computers.map((c) => (c.id === computer.id ? computer : c))
        : [...s.computers, computer],
      pendingPairing: null,
    }));
  },

  disconnect: async () => {
    await persist(TOKEN_KEY, null);
    await persist(REFRESH_KEY, null);
    await persist(COMPUTER_KEY, null);
    await persist(BASE_URL_KEY, null);
    set({
      token: null,
      refreshToken: null,
      computer: null,
      baseUrl: null,
    });
  },

  loadPersisted: async () => {
    const token = await read(TOKEN_KEY);
    const refreshToken = await read(REFRESH_KEY);
    const computerJson = await read(COMPUTER_KEY);
    const baseUrl = await read(BASE_URL_KEY);
    if (token && computerJson) {
      try {
        const computer = JSON.parse(computerJson) as Computer;
        set({
          token,
          refreshToken,
          computer,
          baseUrl,
          computers: [computer],
        });
      } catch {
        // ignore corrupt storage
      }
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
