import { z } from "zod";

import { DeviceCredentialsSchema } from "./credentials.js";
import { ServerInfoSchema } from "./health.js";

export const PairingSessionStatusSchema = z.enum([
  "pending",
  "claimed",
  "approved",
  "expired",
  "rejected",
]);
export type PairingSessionStatus = z.infer<typeof PairingSessionStatusSchema>;

export const PairingSessionSchema = z.object({
  sessionId: z.string().uuid(),
  pairingCode: z.string().min(6).max(12),
  expiresAt: z.string().datetime(),
  status: PairingSessionStatusSchema,
  server: ServerInfoSchema,
});
export type PairingSession = z.infer<typeof PairingSessionSchema>;

export const PairingClaimRequestSchema = z.object({
  sessionId: z.string().uuid(),
  pairingCode: z.string().min(6).max(12),
  deviceName: z.string().min(1).max(128),
  devicePlatform: z.string().min(1).max(64).optional(),
});
export type PairingClaimRequest = z.infer<typeof PairingClaimRequestSchema>;

export const PairingClaimResponseSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.literal("claimed"),
  message: z.string().optional(),
});
export type PairingClaimResponse = z.infer<typeof PairingClaimResponseSchema>;

export const PairingApproveRequestSchema = z.object({
  sessionId: z.string().uuid(),
  approve: z.boolean(),
  deviceLabel: z.string().min(1).max(128).optional(),
});
export type PairingApproveRequest = z.infer<typeof PairingApproveRequestSchema>;

export const PairingApproveResponseSchema = z.discriminatedUnion("approved", [
  z.object({
    approved: z.literal(true),
    credentials: DeviceCredentialsSchema,
  }),
  z.object({
    approved: z.literal(false),
    reason: z.string().optional(),
  }),
]);
export type PairingApproveResponse = z.infer<typeof PairingApproveResponseSchema>;
