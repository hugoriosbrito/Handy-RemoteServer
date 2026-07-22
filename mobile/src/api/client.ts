import { Platform } from 'react-native';
import { z } from 'zod';

const DEFAULT_API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8765'
    : 'http://127.0.0.1:8765';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? DEFAULT_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const QrPayloadSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  secret: z.string().min(1),
  serverName: z.string().min(1),
  fingerprint: z.string().min(1),
  expiresAt: z.string().min(1),
  endpoints: z
    .object({
      local: z.string().nullable().optional(),
      mdns: z.string().nullable().optional(),
      tailscale: z.string().nullable().optional(),
    })
    .optional(),
});

export type QrPayload = z.infer<typeof QrPayloadSchema>;

export const PairingClaimResponseSchema = z.object({
  sessionId: z.string(),
  code: z.string(),
  serverName: z.string(),
  status: z.string(),
});

export const DeviceCredentialsSchema = z.object({
  deviceId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  serverFingerprint: z.string(),
});

export const PairingStatusSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  code: z.string().optional(),
  deviceName: z.string().nullable().optional(),
  credentials: DeviceCredentialsSchema.nullable().optional(),
});

export const HistoryEntrySchema = z.object({
  id: z.string(),
  source: z.string(),
  rawText: z.string(),
  finalText: z.string(),
  postProcessed: z.boolean(),
  promptName: z.string().nullable().optional(),
  audioAvailable: z.boolean(),
  timestamp: z.number().optional(),
});

export const HealthSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().optional(),
});

export const ServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  fingerprint: z.string(),
  platform: z.string().optional(),
  port: z.number().optional(),
});

export type PairingClaimResponse = z.infer<typeof PairingClaimResponseSchema>;
export type DeviceCredentials = z.infer<typeof DeviceCredentialsSchema>;
export type PairingStatus = z.infer<typeof PairingStatusSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

/** UI-friendly transcription shape used by history/result screens. */
export type Transcription = {
  id: string;
  text: string;
  createdAt: string;
  durationMs: number;
  computerName?: string;
};

interface RequestOptions extends RequestInit {
  token?: string | null;
  baseUrl?: string;
}

function resolveBaseUrl(override?: string): string {
  return (override ?? API_BASE_URL).replace(/\/$/, '');
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, baseUrl, ...rest } = options;
  const url = `${resolveBaseUrl(baseUrl)}${path}`;

  const response = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body as { message?: string })?.message ?? response.statusText,
      body,
    );
  }

  return schema.parse(body);
}

function endpointToBaseUrl(endpoint: string | null | undefined): string | null {
  if (!endpoint) return null;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint.replace(/\/$/, '');
  }
  return `http://${endpoint}`.replace(/\/$/, '');
}

/** Prefer LAN IP from QR; on Android emulator always use the host alias. */
export function baseUrlFromQr(qr: QrPayload): string {
  // With `adb reverse tcp:8765`, 10.0.2.2 and 127.0.0.1 both reach the host.
  // Prefer the stable emulator alias so QR LAN IPs (container/host) still work.
  if (Platform.OS === 'android') {
    const local = endpointToBaseUrl(qr.endpoints?.local ?? null);
    if (local) {
      try {
        const parsed = new URL(local);
        return `http://10.0.2.2:${parsed.port || '8765'}`;
      } catch {
        return API_BASE_URL;
      }
    }
    return API_BASE_URL;
  }

  const local = endpointToBaseUrl(qr.endpoints?.local ?? null);
  return local ?? API_BASE_URL;
}

export const api = {
  health: (baseUrl?: string) =>
    request('/v1/health', HealthSchema, { baseUrl }),

  getServerInfo: (baseUrl?: string) =>
    request('/v1/server', ServerInfoSchema, { baseUrl }),

  claimPairing: (
    data: {
      sessionId: string;
      secret: string;
      deviceName: string;
      platform?: string;
    },
    baseUrl?: string,
  ) =>
    request('/v1/pairing/claim', PairingClaimResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
      baseUrl,
    }),

  getPairingStatus: (sessionId: string, baseUrl?: string) =>
    request(
      `/v1/pairing/sessions/${encodeURIComponent(sessionId)}`,
      PairingStatusSchema,
      { baseUrl },
    ),

  getHistory: async (token: string, baseUrl?: string): Promise<{ items: Transcription[] }> => {
    const entries = await request('/v1/history', z.array(HistoryEntrySchema), {
      token,
      baseUrl,
    });
    return {
      items: entries.map((e) => ({
        id: e.id,
        text: e.finalText || e.rawText,
        createdAt: e.timestamp
          ? new Date(e.timestamp * 1000).toISOString()
          : new Date().toISOString(),
        durationMs: 0,
        computerName: e.source,
      })),
    };
  },

  parseQrPayload: (raw: string): QrPayload => {
    const parsed = JSON.parse(raw) as unknown;
    return QrPayloadSchema.parse(parsed);
  },
};
