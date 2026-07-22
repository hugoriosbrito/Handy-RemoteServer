import { z } from "zod";

export const DeviceCredentialsSchema = z.object({
  deviceId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  serverFingerprint: z.string().min(1),
});
export type DeviceCredentials = z.infer<typeof DeviceCredentialsSchema>;
