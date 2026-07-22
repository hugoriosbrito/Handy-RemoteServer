import { z } from "zod";

export const TranscriptionCreateRequestSchema = z.object({
  postProcess: z.boolean().optional(),
  promptId: z.string().optional(),
  language: z.string().optional(),
});
export type TranscriptionCreateRequest = z.infer<
  typeof TranscriptionCreateRequestSchema
>;

export const TranscriptionStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
]);
export type TranscriptionStatus = z.infer<typeof TranscriptionStatusSchema>;

export const TranscriptionCreateResponseSchema = z.object({
  id: z.string().uuid(),
  status: TranscriptionStatusSchema,
  rawText: z.string(),
  finalText: z.string(),
  postProcessed: z.boolean(),
  promptName: z.string().nullable().optional(),
  error: z.string().optional(),
});
export type TranscriptionCreateResponse = z.infer<
  typeof TranscriptionCreateResponseSchema
>;
