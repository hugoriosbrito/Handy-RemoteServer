import { z } from "zod";

export const QrEndpointsSchema = z.object({
  local: z.string().nullable().optional(),
  mdns: z.string().nullable().optional(),
  tailscale: z.string().nullable().optional(),
});
export type QrEndpoints = z.infer<typeof QrEndpointsSchema>;

/** Payload embedded in the desktop QR code (JSON string). */
export const QrPairingPayloadSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  secret: z.string().min(1),
  serverName: z.string().min(1),
  fingerprint: z.string().min(1),
  expiresAt: z.string().min(1),
  endpoints: QrEndpointsSchema,
});
export type QrPairingPayload = z.infer<typeof QrPairingPayloadSchema>;
