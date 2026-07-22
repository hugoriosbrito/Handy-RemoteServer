import { z } from "zod";

export const HealthStatusSchema = z.enum(["ok", "degraded", "unavailable"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  version: z.string(),
  uptimeSeconds: z.number().nonnegative().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  fingerprint: z.string(),
  platform: z.string().optional(),
  capabilities: z.object({
    transcription: z.boolean(),
    postProcessing: z.boolean(),
    history: z.boolean(),
    audioPlayback: z.boolean().optional(),
  }),
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;
