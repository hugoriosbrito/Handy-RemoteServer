import { z } from "zod";

export const PostProcessingPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type PostProcessingPrompt = z.infer<typeof PostProcessingPromptSchema>;

export const PostProcessingProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  configured: z.boolean(),
});
export type PostProcessingProvider = z.infer<typeof PostProcessingProviderSchema>;

/** Safe post-processing metadata exposed to remote clients (no API keys). */
export const PostProcessingInfoSchema = z.object({
  enabled: z.boolean(),
  defaultPromptId: z.string().nullable().optional(),
  prompts: z.array(PostProcessingPromptSchema),
  providers: z.array(PostProcessingProviderSchema),
});
export type PostProcessingInfo = z.infer<typeof PostProcessingInfoSchema>;
