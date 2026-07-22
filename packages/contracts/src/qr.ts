import { z } from "zod";

export const QrPairingPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal("handy-remote-pair"),
  url: z.string().url(),
  sessionId: z.string().uuid(),
  pairingCode: z.string().min(6).max(12),
  fingerprint: z.string().min(1),
  serverName: z.string().optional(),
});
export type QrPairingPayload = z.infer<typeof QrPairingPayloadSchema>;
