import {
  HealthResponseSchema,
  HistoryListResponseSchema,
  HistoryEntrySchema,
  PairingApproveRequestSchema,
  PairingApproveResponseSchema,
  PairingClaimRequestSchema,
  PairingClaimResponseSchema,
  PairingSessionSchema,
  PostProcessingInfoSchema,
  ServerInfoSchema,
  TranscriptionCreateRequestSchema,
  TranscriptionCreateResponseSchema,
  type DeviceCredentials,
  type HealthResponse,
  type HistoryEntry,
  type HistoryListResponse,
  type PairingApproveRequest,
  type PairingApproveResponse,
  type PairingClaimRequest,
  type PairingClaimResponse,
  type PairingSession,
  type PostProcessingInfo,
  type ServerInfo,
  type TranscriptionCreateRequest,
  type TranscriptionCreateResponse,
} from "@handy-remote/contracts";
import type { ZodType } from "zod";

import { RemoteApiError, RemoteApiValidationError } from "./errors.js";

export interface RemoteApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export class RemoteApiClient {
  private readonly baseUrl: string;
  private accessToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
  }

  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  async health(): Promise<HealthResponse> {
    return this.request("GET", "/health", HealthResponseSchema);
  }

  async getServerInfo(): Promise<ServerInfo> {
    return this.request("GET", "/api/v1/server", ServerInfoSchema);
  }

  async createPairingSession(): Promise<PairingSession> {
    return this.request("POST", "/api/v1/pairing/sessions", PairingSessionSchema);
  }

  async claimPairing(
    payload: PairingClaimRequest,
  ): Promise<PairingClaimResponse> {
    const body = PairingClaimRequestSchema.parse(payload);
    return this.request(
      "POST",
      "/api/v1/pairing/claim",
      PairingClaimResponseSchema,
      { json: body },
    );
  }

  async approvePairing(
    payload: PairingApproveRequest,
  ): Promise<PairingApproveResponse> {
    const body = PairingApproveRequestSchema.parse(payload);
    return this.request(
      "POST",
      "/api/v1/pairing/approve",
      PairingApproveResponseSchema,
      { json: body, auth: true },
    );
  }

  async createTranscription(
    audio: Blob,
    options?: TranscriptionCreateRequest,
  ): Promise<TranscriptionCreateResponse> {
    const params = TranscriptionCreateRequestSchema.parse(options ?? {});
    const formData = new FormData();
    formData.append("audio", audio, "recording.webm");

    if (params.postProcess !== undefined) {
      formData.append("postProcess", String(params.postProcess));
    }
    if (params.promptId) {
      formData.append("promptId", params.promptId);
    }
    if (params.language) {
      formData.append("language", params.language);
    }

    return this.request(
      "POST",
      "/api/v1/transcriptions",
      TranscriptionCreateResponseSchema,
      { formData, auth: true },
    );
  }

  async listHistory(params?: {
    limit?: number;
    offset?: number;
  }): Promise<HistoryListResponse> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) {
      search.set("limit", String(params.limit));
    }
    if (params?.offset !== undefined) {
      search.set("offset", String(params.offset));
    }

    const query = search.toString();
    const path = query ? `/api/v1/history?${query}` : "/api/v1/history";

    return this.request("GET", path, HistoryListResponseSchema, { auth: true });
  }

  async getHistoryEntry(id: string): Promise<HistoryEntry> {
    return this.request(
      "GET",
      `/api/v1/history/${encodeURIComponent(id)}`,
      HistoryEntrySchema,
      { auth: true },
    );
  }

  async getPostProcessingInfo(): Promise<PostProcessingInfo> {
    return this.request(
      "GET",
      "/api/v1/post-processing",
      PostProcessingInfoSchema,
      { auth: true },
    );
  }

  async refreshCredentials(
    refreshToken: string,
  ): Promise<DeviceCredentials> {
    const { DeviceCredentialsSchema } = await import("@handy-remote/contracts");
    return this.request(
      "POST",
      "/api/v1/auth/refresh",
      DeviceCredentialsSchema,
      { json: { refreshToken } },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    schema: ZodType<T>,
    options: {
      json?: unknown;
      formData?: FormData;
      auth?: boolean;
    } = {},
  ): Promise<T> {
    const headers = new Headers();

    if (options.json !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (options.auth && this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body:
        options.formData ??
        (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    });

    const rawBody = await this.readBody(response);

    if (!response.ok) {
      throw new RemoteApiError(
        `Request failed: ${method} ${path}`,
        response.status,
        rawBody,
      );
    }

    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      throw new RemoteApiValidationError(
        `Invalid response for ${method} ${path}`,
        parsed.error.flatten(),
      );
    }

    return parsed.data;
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    return text.length > 0 ? text : null;
  }
}
