import {
  api,
  apiErrorCode,
  ApiError,
  type TranscriptionResponse,
} from "@/api/client";
import { useConnectionStore } from "@/stores/connectionStore";

/**
 * Probe the paired Handy server. Returns true when reachable **and** the stored
 * token is still accepted: `/v1/health` is unauthenticated, so probing it alone
 * reported "connected" even when every upload was being rejected with 401.
 */
export async function probeServerHealth(
  baseUrl?: string | null,
): Promise<boolean> {
  const url = baseUrl ?? useConnectionStore.getState().baseUrl;
  if (!url) return false;

  try {
    await api.health(url);
  } catch {
    useConnectionStore.getState().setComputerOnline(false);
    return false;
  }

  const token = useConnectionStore.getState().token;
  if (!token) {
    useConnectionStore.getState().setComputerOnline(true);
    return true;
  }

  try {
    await api.getSession(token, url);
    useConnectionStore.getState().setComputerOnline(true);
    useConnectionStore.getState().setNeedsRepair(false);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const refreshed = await refreshCredentials(url);
      useConnectionStore.getState().setComputerOnline(refreshed);
      return refreshed;
    }
    // Reachable but a non-auth failure: still treat the PC as online.
    useConnectionStore.getState().setComputerOnline(true);
    return true;
  }
}

/**
 * Rotate the stored credentials using the refresh token. Returns true when a
 * new access token was obtained; false means the pairing is gone on the PC and
 * the user has to pair again.
 */
export async function refreshCredentials(
  baseUrl?: string | null,
): Promise<boolean> {
  const state = useConnectionStore.getState();
  const url = baseUrl ?? state.baseUrl;
  const refreshToken = state.refreshToken;
  if (!url || !refreshToken) {
    useConnectionStore.getState().setNeedsRepair(true);
    return false;
  }
  try {
    const credentials = await api.refreshCredentials(refreshToken, url);
    useConnectionStore
      .getState()
      .setCredentials(credentials.accessToken, credentials.refreshToken);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      useConnectionStore.getState().setNeedsRepair(true);
    }
    return false;
  }
}

/**
 * Try to (re)establish reachability with the paired PC. Probes the active base
 * URL first, then every other advertised endpoint (mDNS `.local`, tailscale…).
 * On success it switches the active base URL to the one that answered, so a PC
 * whose DHCP IP changed while the phone was away reconnects without re-pairing.
 * Returns the reachable base URL, or null if none answered.
 */
export async function reconnectBestEndpoint(): Promise<string | null> {
  const state = useConnectionStore.getState();
  const active = state.baseUrl;
  // Active URL first (fast path), then the rest, de-duplicated.
  const candidates = Array.from(
    new Set([...(active ? [active] : []), ...state.endpoints].filter(Boolean)),
  );
  if (candidates.length === 0) return null;

  for (const url of candidates) {
    try {
      await api.health(url);
      useConnectionStore.getState().setActiveBaseUrl(url);
      useConnectionStore.getState().setComputerOnline(true);
      return url;
    } catch {
      // Try the next candidate.
    }
  }

  useConnectionStore.getState().setComputerOnline(false);
  return null;
}

/** Upload with retries — transient LAN blips shouldn't dump the user to "offline". */
const NON_RETRYABLE_CODES = new Set([
  "invalid_audio",
  "too_large",
  "multiple_files",
  "missing_file",
  "desktop_busy",
  "stream_unavailable",
  "unauthorized",
]);

export function isRetryableUploadError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 0 || error.status >= 500 || error.status === 429) return true;
  if (error.status === 401) return false;
  return !NON_RETRYABLE_CODES.has(apiErrorCode(error) ?? "");
}

async function waitForTranscriptionJob(
  token: string,
  jobId: string,
  baseUrl?: string,
): Promise<TranscriptionResponse> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const job = await api.getTranscriptionJob(token, jobId, baseUrl);
    if (job.status === "completed" && job.transcription) return job.transcription;
    if (job.status === "failed") {
      throw new ApiError(422, job.errorMessage ?? "Transcription failed", {
        error: job.errorCode ?? "transcription_failed",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  throw new ApiError(504, "The desktop is still processing this recording", {
    error: "job_timeout",
  });
}

export async function uploadWithRetry(
  token: string,
  uriOrUris: string | string[],
  opts: {
    postProcess?: boolean;
    baseUrl?: string;
    filename?: string;
    attempts?: number;
    /** Live preview only — never write history / durable audio. */
    preview?: boolean;
    recordingId?: string;
  } = {},
) {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  let activeToken = token;
  let refreshTried = false;
  for (let i = 0; i < attempts; i++) {
    try {
      const job = await api.uploadTranscription(activeToken, uriOrUris, {
        postProcess: opts.postProcess,
        baseUrl: opts.baseUrl,
        filename: opts.filename,
        preview: opts.preview,
        recordingId: opts.recordingId,
      });
      useConnectionStore.getState().setComputerOnline(true);
      return await waitForTranscriptionJob(activeToken, job.id, opts.baseUrl);
    } catch (e) {
      lastError = e;
      // A rejected token never recovers by retrying the same request. Rotate
      // credentials once and retry with the new access token; if the PC no
      // longer knows this device, surface "re-pair needed" instead of a
      // generic upload failure.
      if (e instanceof ApiError && e.status === 401 && !refreshTried) {
        refreshTried = true;
        const refreshed = await refreshCredentials(opts.baseUrl);
        if (refreshed) {
          const next = useConnectionStore.getState().token;
          if (next) {
            activeToken = next;
            continue;
          }
        }
        throw e;
      }
      if (!isRetryableUploadError(e)) throw e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
  }
  // Distinguish "PC down" from a one-off upload error.
  await probeServerHealth(opts.baseUrl);
  throw lastError instanceof Error ? lastError : new Error("upload_failed");
}
