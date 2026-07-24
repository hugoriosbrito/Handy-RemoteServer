import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import {
  baseUrlCandidatesFromQr,
  baseUrlFromQr,
  type QrPayload,
} from "@/api/client";

const TOKEN_KEY = "handy_auth_token";
const REFRESH_KEY = "handy_refresh_token";
const COMPUTER_KEY = "handy_computer";
const BASE_URL_KEY = "handy_base_url";
const ENDPOINTS_KEY = "handy_endpoints";

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
  /** All base URLs advertised in the QR, for reconnect failover. */
  endpoints: string[];
}

interface ConnectionState {
  token: string | null;
  refreshToken: string | null;
  baseUrl: string | null;
  /** Known reachable base URLs (LAN IP, mDNS, tailscale) for failover. */
  endpoints: string[];
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
  setComputerOnline: (online: boolean) => void;
  /** Switch the active base URL (e.g. after reconnect failover) and persist it. */
  setActiveBaseUrl: (url: string) => void;
  connect: (
    token: string,
    computer: Computer,
    opts?: { refreshToken?: string; baseUrl?: string; endpoints?: string[] },
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
  endpoints: [],
  computer: null,
  computers: [],
  pairingCode: "",
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
    const candidates = baseUrlCandidatesFromQr(qr);
    const resolvedBaseUrl = baseUrlFromQr(qr);
    set({
      pendingPairing: {
        sessionId: qr.sessionId,
        secret: qr.secret,
        code: code ?? "",
        serverName: qr.serverName,
        fingerprint: qr.fingerprint,
        baseUrl: resolvedBaseUrl,
        endpoints: candidates,
      },
      pairingCode: code ?? get().pairingCode,
      baseUrl: resolvedBaseUrl,
      endpoints: candidates,
    });
  },

  setConnecting: (v) => set({ isConnecting: v }),
  setReconnecting: (v) => set({ isReconnecting: v }),

  setActiveBaseUrl: (url) => {
    if (get().baseUrl === url) return;
    void persist(BASE_URL_KEY, url);
    set({ baseUrl: url });
  },

  setComputerOnline: (online) =>
    set((s) => {
      if (!s.computer) return {};
      const computer = {
        ...s.computer,
        isOnline: online,
        lastSeen: new Date().toISOString(),
      };
      void persist(COMPUTER_KEY, JSON.stringify(computer));
      return {
        computer,
        computers: s.computers.map((c) =>
          c.id === computer.id ? computer : c,
        ),
      };
    }),

  connect: async (token, computer, opts) => {
    const nextBaseUrl = opts?.baseUrl ?? get().baseUrl;
    const refreshToken = opts?.refreshToken ?? get().refreshToken;
    // Merge advertised endpoints with the active URL so failover always has it.
    const endpoints = Array.from(
      new Set(
        [
          ...(opts?.endpoints ?? get().endpoints),
          ...(nextBaseUrl ? [nextBaseUrl] : []),
        ].filter(Boolean),
      ),
    );
    await persist(TOKEN_KEY, token);
    await persist(COMPUTER_KEY, JSON.stringify(computer));
    if (refreshToken) await persist(REFRESH_KEY, refreshToken);
    if (nextBaseUrl) await persist(BASE_URL_KEY, nextBaseUrl);
    await persist(ENDPOINTS_KEY, JSON.stringify(endpoints));
    set((s) => ({
      token,
      computer,
      refreshToken: refreshToken ?? null,
      baseUrl: nextBaseUrl ?? null,
      endpoints,
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
    await persist(ENDPOINTS_KEY, null);
    set({
      token: null,
      refreshToken: null,
      computer: null,
      baseUrl: null,
      endpoints: [],
    });
  },

  loadPersisted: async () => {
    const token = await read(TOKEN_KEY);
    const refreshToken = await read(REFRESH_KEY);
    const computerJson = await read(COMPUTER_KEY);
    const baseUrl = await read(BASE_URL_KEY);
    const endpointsJson = await read(ENDPOINTS_KEY);
    if (token && computerJson) {
      try {
        const computer = JSON.parse(computerJson) as Computer;
        let endpoints: string[] = [];
        try {
          endpoints = endpointsJson
            ? (JSON.parse(endpointsJson) as string[])
            : [];
        } catch {
          endpoints = [];
        }
        // Ensure the active URL is always among the failover candidates.
        if (baseUrl && !endpoints.includes(baseUrl))
          endpoints = [baseUrl, ...endpoints];
        // Assume online until a health probe says otherwise — stale isOnline:false
        // from a previous session was falsely showing "PC offline".
        set({
          token,
          refreshToken,
          computer: { ...computer, isOnline: true },
          baseUrl,
          endpoints,
          computers: [{ ...computer, isOnline: true }],
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
