import { z } from "zod";

export const PostProcessingPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type PostProcessingPrompt = z.infer<typeof PostProcessingPromptSchema>;

/** Safe post-processing metadata exposed to remote clients (no API keys). */
export const PostProcessingInfoSchema = z.object({
  available: z.boolean(),
  configured: z.boolean(),
  apiKeyConfigured: z.boolean(),
  providerId: z.string().nullable().optional(),
  providerLabel: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  selectedPrompt: PostProcessingPromptSchema.nullable().optional(),
  prompts: z.array(PostProcessingPromptSchema),
});
export type PostProcessingInfo = z.infer<typeof PostProcessingInfoSchema>;

// Keep legacy alias used by older stubs.
export const PostProcessingProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  configured: z.boolean(),
});
export type PostProcessingProvider = z.infer<typeof PostProcessingProviderSchema>;
