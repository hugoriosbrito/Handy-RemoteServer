import { z } from "zod";

import { DeviceCredentialsSchema } from "./credentials.js";
import { QrPairingPayloadSchema } from "./qr.js";

export const PairingSessionStatusSchema = z.enum([
  "pending",
  "awaiting_approval",
  "claimed",
  "approved",
  "expired",
  "rejected",
]);
export type PairingSessionStatus = z.infer<typeof PairingSessionStatusSchema>;

export const PairingSessionSchema = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(6).max(12),
  expiresAt: z.string().min(1),
  qr: QrPairingPayloadSchema,
});
export type PairingSession = z.infer<typeof PairingSessionSchema>;

export const PairingClaimRequestSchema = z.object({
  sessionId: z.string().min(1),
  secret: z.string().min(1),
  deviceName: z.string().min(1).max(128),
  platform: z.string().min(1).max(64).optional(),
});
export type PairingClaimRequest = z.infer<typeof PairingClaimRequestSchema>;

export const PairingClaimResponseSchema = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(6).max(12),
  serverName: z.string().min(1),
  status: z.string(),
});
export type PairingClaimResponse = z.infer<typeof PairingClaimResponseSchema>;

export const PairingApproveRequestSchema = z.object({
  sessionId: z.string().min(1),
  approve: z.boolean(),
});
export type PairingApproveRequest = z.infer<typeof PairingApproveRequestSchema>;

export const PairingApproveResponseSchema = z.object({
  status: z.string(),
  sessionId: z.string().min(1),
  credentials: DeviceCredentialsSchema.optional().nullable(),
});
export type PairingApproveResponse = z.infer<
  typeof PairingApproveResponseSchema
>;

export const PairingStatusResponseSchema = z.object({
  sessionId: z.string().min(1),
  status: PairingSessionStatusSchema,
  code: z.string().optional(),
  deviceName: z.string().nullable().optional(),
  credentials: DeviceCredentialsSchema.nullable().optional(),
});
export type PairingStatusResponse = z.infer<typeof PairingStatusResponseSchema>;
