import { api } from "@/api/client";
import { useConnectionStore } from "@/stores/connectionStore";

/** Probe the paired Handy server. Returns true when reachable. */
export async function probeServerHealth(
  baseUrl?: string | null,
): Promise<boolean> {
  const url = baseUrl ?? useConnectionStore.getState().baseUrl;
  if (!url) return false;

  try {
    await api.health(url);
    useConnectionStore.getState().setComputerOnline(true);
    return true;
  } catch {
    useConnectionStore.getState().setComputerOnline(false);
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
  } = {},
) {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await api.uploadTranscription(token, uriOrUris, {
        postProcess: opts.postProcess,
        baseUrl: opts.baseUrl,
        filename: opts.filename,
        preview: opts.preview,
      });
      useConnectionStore.getState().setComputerOnline(true);
      return result;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
  }
  // Distinguish "PC down" from a one-off upload error.
  await probeServerHealth(opts.baseUrl);
  throw lastError instanceof Error ? lastError : new Error("upload_failed");
}
