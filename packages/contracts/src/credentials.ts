import { z } from "zod";

export const DeviceCredentialsSchema = z.object({
  deviceId: z.string().uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  serverFingerprint: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});
export type DeviceCredentials = z.infer<typeof DeviceCredentialsSchema>;
