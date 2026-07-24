import { Platform } from "react-native";
import { z } from "zod";

const DEFAULT_API_URL = "http://127.0.0.1:8765";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
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
  durationMs: z.number().optional(),
});

export const ModelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  sizeMb: z.number(),
  isDownloaded: z.boolean(),
  isActive: z.boolean(),
  supportsTranslation: z.boolean(),
  supportsStreaming: z.boolean().optional(),
  isRecommended: z.boolean(),
  accuracyScore: z.number().optional(),
  speedScore: z.number().optional(),
  supportedLanguages: z.array(z.string()).optional(),
});

export const ModelsInfoSchema = z.object({
  activeModelId: z.string().nullable().optional(),
  models: z.array(ModelSummarySchema),
});

export const PostProcessingPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const PostProcessingInfoSchema = z.object({
  available: z.boolean(),
  configured: z.boolean(),
  apiKeyConfigured: z.boolean(),
  providerId: z.string().nullable().optional(),
  providerLabel: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  selectedPrompt: PostProcessingPromptSchema.nullable().optional(),
  prompts: z.array(PostProcessingPromptSchema),
});

export const ClientSettingsSchema = z.object({
  soundTheme: z.string(),
  audioFeedback: z.boolean(),
});

export type ModelSummary = {
  id: string;
  name: string;
  description: string;
  sizeMb: number;
  isDownloaded: boolean;
  isActive: boolean;
  supportsTranslation: boolean;
  supportsStreaming: boolean;
  isRecommended: boolean;
  accuracyScore?: number;
  speedScore?: number;
  supportedLanguages?: string[];
};
export type ModelsInfo = {
  activeModelId?: string | null;
  models: ModelSummary[];
};
export type PostProcessingPrompt = z.infer<typeof PostProcessingPromptSchema>;
export type PostProcessingInfo = z.infer<typeof PostProcessingInfoSchema>;
export type ClientSettings = z.infer<typeof ClientSettingsSchema>;

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

export const TranscriptionResponseSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  finalText: z.string(),
  postProcessed: z.boolean(),
  promptName: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  durationMs: z.number().optional(),
});

export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

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
  /** Abort the request after this many ms. Prevents hangs on stale LAN IPs. */
  timeoutMs?: number;
}

/** Default per-request timeout. LAN probes must fail fast, not hang for minutes. */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * fetch() with an AbortController timeout. A request to an unreachable LAN host
 * would otherwise hang for a very long time, stalling reconnection and health polls.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolveBaseUrl(override?: string): string {
  return rewriteLoopback(override ?? API_BASE_URL).replace(/\/$/, "");
}

/** On Android emulator, host loopback is 10.0.2.2 — not 127.0.0.1. */
function rewriteLoopback(url: string): string {
  if (Platform.OS !== "android") return url;
  try {
    const parsed = new URL(url.includes("://") ? url : `http://${url}`);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      parsed.hostname = "10.0.2.2";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    // keep original
  }
  return url;
}

function isLoopbackBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `http://${url}`);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function networkErrorMessage(url: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (
    /network request failed/i.test(detail) ||
    /failed to fetch/i.test(detail)
  ) {
    if (isLoopbackBaseUrl(url) && Platform.OS !== "web") {
      return `Não foi possível alcançar ${url}. No celular físico use o IP da rede local do PC (não 127.0.0.1). Confira Wi‑Fi, firewall e se o Acesso móvel está ativo.`;
    }
    return `Falha de rede ao contatar ${url}. Celular e PC precisam estar na mesma Wi‑Fi; no Windows, permita a porta do Handy no Firewall.`;
  }
  return detail || "Falha de rede";
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, baseUrl, timeoutMs, ...rest } = options;
  const url = `${resolveBaseUrl(baseUrl)}${path}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...rest,
      timeoutMs,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (e) {
    throw new ApiError(0, networkErrorMessage(url, e), { url });
  }

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
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return rewriteLoopback(endpoint.replace(/\/$/, ""));
  }
  return rewriteLoopback(`http://${endpoint}`.replace(/\/$/, ""));
}

/**
 * All reachable base URLs advertised in the QR, in preference order and
 * de-duplicated. Keeping every candidate (LAN IP + mDNS `.local` + tailscale)
 * lets the app recover automatically when the PC's DHCP IP changes: even if the
 * stored LAN IP goes stale, the mDNS name still resolves on the same network.
 */
export function baseUrlCandidatesFromQr(qr: QrPayload): string[] {
  const ordered = [
    endpointToBaseUrl(qr.endpoints?.local ?? null),
    endpointToBaseUrl(qr.endpoints?.mdns ?? null),
    endpointToBaseUrl(qr.endpoints?.tailscale ?? null),
  ].filter((u): u is string => Boolean(u));
  const unique = Array.from(new Set(ordered));
  return unique.length > 0 ? unique : [resolveBaseUrl()];
}

/** Prefer LAN IP from QR; rewrite emulator loopback when needed. */
export function baseUrlFromQr(qr: QrPayload): string {
  return baseUrlCandidatesFromQr(qr)[0];
}

function extractQrJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;

  // Deep link: handy-remote://pair/inject?payload=<urlencoded json>
  try {
    const asUrl = new URL(trimmed);
    const payload = asUrl.searchParams.get("payload");
    if (payload) return decodeURIComponent(payload);
  } catch {
    // not a URL
  }

  // Query-only or path with payload=
  const match = /(?:^|[?&])payload=([^&]+)/.exec(trimmed);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  return trimmed;
}

export const api = {
  health: (baseUrl?: string) =>
    request("/v1/health", HealthSchema, { baseUrl, timeoutMs: 4000 }),

  getServerInfo: (baseUrl?: string) =>
    request("/v1/server", ServerInfoSchema, { baseUrl }),

  claimPairing: (
    data: {
      sessionId: string;
      secret: string;
      deviceName: string;
      platform?: string;
    },
    baseUrl?: string,
  ) =>
    request("/v1/pairing/claim", PairingClaimResponseSchema, {
      method: "POST",
      body: JSON.stringify(data),
      baseUrl,
    }),

  getPairingStatus: (sessionId: string, baseUrl?: string) =>
    request(
      `/v1/pairing/sessions/${encodeURIComponent(sessionId)}`,
      PairingStatusSchema,
      { baseUrl },
    ),

  getHistory: async (
    token: string,
    baseUrl?: string,
  ): Promise<{ items: Transcription[] }> => {
    const entries = await request("/v1/history", z.array(HistoryEntrySchema), {
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
        durationMs: e.durationMs ?? 0,
        computerName: e.source,
      })),
    };
  },

  uploadTranscription: async (
    token: string,
    uriOrUris: string | string[],
    opts?: {
      postProcess?: boolean;
      /** Live preview only — do not save history / durable audio on the PC. */
      preview?: boolean;
      baseUrl?: string;
      filename?: string;
    },
  ) => {
    const form = new FormData();
    const uris = Array.isArray(uriOrUris) ? uriOrUris : [uriOrUris];
    const filename = opts?.filename ?? "recording.m4a";
    const mime = filename.endsWith(".wav") ? "audio/wav" : "audio/m4a";

    uris.forEach((uri, index) => {
      const partName =
        uris.length === 1
          ? filename
          : filename.replace(
              /(\.[^.]+)?$/,
              (ext) => `-part${index + 1}${ext || ".m4a"}`,
            );
      form.append("file", {
        uri,
        name: partName,
        type: mime,
      } as unknown as Blob);
    });
    if (opts?.postProcess) {
      form.append("postProcess", "true");
    }
    if (opts?.preview) {
      form.append("preview", "true");
    }

    const url = `${resolveBaseUrl(opts?.baseUrl)}/v1/transcriptions`;
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        // Audio uploads can be large / slow on the LAN — allow generous headroom.
        // Multi-file finals need even more room to decode + concatenate + transcribe.
        timeoutMs: uris.length > 1 ? 90000 : 45000,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });
    } catch (e) {
      throw new ApiError(0, networkErrorMessage(url, e), { url });
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        (body as { message?: string })?.message ?? response.statusText,
        body,
      );
    }

    return TranscriptionResponseSchema.parse(body);
  },

  /** Absolute URL of the stored audio for a transcription (streamed from the PC). */
  transcriptionAudioUrl: (id: string, baseUrl?: string): string =>
    `${resolveBaseUrl(baseUrl)}/v1/transcriptions/${encodeURIComponent(id)}/audio`,

  /** Re-run speech-to-text on the audio the PC already stored for this entry. */
  retranscribe: (token: string, id: string, baseUrl?: string) =>
    request(
      `/v1/transcriptions/${encodeURIComponent(id)}/retranscribe`,
      TranscriptionResponseSchema,
      { method: "POST", token, baseUrl, timeoutMs: 45000 },
    ),

  /** Re-run AI post-processing on the text the PC already stored for this entry. */
  reprocess: (token: string, id: string, baseUrl?: string) =>
    request(
      `/v1/transcriptions/${encodeURIComponent(id)}/reprocess`,
      TranscriptionResponseSchema,
      { method: "POST", token, baseUrl, timeoutMs: 45000 },
    ),

  getModels: async (token: string, baseUrl?: string): Promise<ModelsInfo> => {
    const data = await request("/v1/models", ModelsInfoSchema, {
      token,
      baseUrl,
    });
    return {
      activeModelId: data.activeModelId,
      models: data.models.map((m) => ({
        ...m,
        supportsStreaming: m.supportsStreaming === true,
        accuracyScore: m.accuracyScore ?? 0,
        speedScore: m.speedScore ?? 0,
        supportedLanguages: m.supportedLanguages ?? [],
      })),
    };
  },

  selectModel: async (
    token: string,
    modelId: string,
    baseUrl?: string,
  ): Promise<ModelsInfo> => {
    const data = await request("/v1/models/select", ModelsInfoSchema, {
      method: "POST",
      body: JSON.stringify({ modelId }),
      token,
      baseUrl,
    });
    return {
      activeModelId: data.activeModelId,
      models: data.models.map((m) => ({
        ...m,
        supportsStreaming: m.supportsStreaming === true,
        accuracyScore: m.accuracyScore ?? 0,
        speedScore: m.speedScore ?? 0,
        supportedLanguages: m.supportedLanguages ?? [],
      })),
    };
  },

  listDevices: (token: string, baseUrl?: string) =>
    request(
      "/v1/devices",
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          platform: z.string().nullable().optional(),
          createdAt: z.string().optional(),
          lastSeenAt: z.string().nullable().optional(),
        }),
      ),
      { token, baseUrl },
    ),

  revokeDevice: (token: string, id: string, baseUrl?: string) =>
    request(
      `/v1/devices/${encodeURIComponent(id)}`,
      z
        .object({
          revoked: z.boolean().optional(),
          id: z.string().optional(),
        })
        .passthrough(),
      { method: "DELETE", token, baseUrl },
    ),

  getPostProcessing: (token: string, baseUrl?: string) =>
    request("/v1/post-processing", PostProcessingInfoSchema, {
      token,
      baseUrl,
    }),

  selectPrompt: (token: string, promptId: string, baseUrl?: string) =>
    request("/v1/post-processing/select-prompt", PostProcessingInfoSchema, {
      method: "POST",
      body: JSON.stringify({ promptId }),
      token,
      baseUrl,
    }),

  getClientSettings: (token: string, baseUrl?: string) =>
    request("/v1/settings", ClientSettingsSchema, { token, baseUrl }),

  parseQrPayload: (raw: string): QrPayload => {
    const json = extractQrJson(raw);
    const parsed = JSON.parse(json) as unknown;
    return QrPayloadSchema.parse(parsed);
  },
};
