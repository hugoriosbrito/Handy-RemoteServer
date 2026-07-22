import { z } from 'zod';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.handy.remote';

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

export const PairRequestSchema = z.object({
  code: z.string().min(6).max(6),
  deviceName: z.string(),
});

export const PairResponseSchema = z.object({
  token: z.string(),
  computerId: z.string(),
  computerName: z.string(),
});

export const TranscriptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  durationMs: z.number(),
  computerName: z.string().optional(),
});

export const HistoryResponseSchema = z.object({
  items: z.array(TranscriptionSchema),
});

export type PairRequest = z.infer<typeof PairRequestSchema>;
export type PairResponse = z.infer<typeof PairResponseSchema>;
export type Transcription = z.infer<typeof TranscriptionSchema>;

interface RequestOptions extends RequestInit {
  token?: string | null;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const url = `${API_BASE_URL}${path}`;

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

export const api = {
  pair: (data: PairRequest) =>
    request('/v1/pair', PairResponseSchema, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHistory: (token: string) =>
    request('/v1/history', HistoryResponseSchema, { token }),

  getTranscription: (token: string, id: string) =>
    request(`/v1/transcriptions/${id}`, TranscriptionSchema, { token }),

  /** Stub — returns mock data when API is unreachable */
  async pairMock(data: PairRequest): Promise<PairResponse> {
    await new Promise((r) => setTimeout(r, 800));
    return {
      token: 'mock-token-' + Date.now(),
      computerId: 'comp-1',
      computerName: data.deviceName || 'MacBook Pro',
    };
  },

  async getHistoryMock(): Promise<{ items: Transcription[] }> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      items: [
        {
          id: '1',
          text: 'Olá, esta é uma transcrição de exemplo gravada pelo celular.',
          createdAt: new Date().toISOString(),
          durationMs: 12500,
          computerName: 'MacBook Pro',
        },
        {
          id: '2',
          text: 'Reunião de equipe sobre o lançamento do produto na próxima semana.',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          durationMs: 45200,
          computerName: 'Desktop Linux',
        },
        {
          id: '3',
          text: 'Notas rápidas sobre a apresentação de hoje.',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          durationMs: 8300,
          computerName: 'MacBook Pro',
        },
      ],
    };
  },
};
