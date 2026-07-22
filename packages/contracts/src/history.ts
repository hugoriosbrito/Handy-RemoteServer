import { z } from "zod";

export const HistorySourceSchema = z.enum(["desktop", "remote", "import"]);
export type HistorySource = z.infer<typeof HistorySourceSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string(),
  source: HistorySourceSchema,
  rawText: z.string(),
  finalText: z.string(),
  postProcessed: z.boolean(),
  promptName: z.string().nullable().optional(),
  audioAvailable: z.boolean(),
  createdAt: z.string().datetime().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const HistoryListResponseSchema = z.object({
  entries: z.array(HistoryEntrySchema),
  hasMore: z.boolean(),
});
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;
