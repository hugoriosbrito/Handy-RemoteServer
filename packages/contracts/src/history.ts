import { z } from "zod";

export const HistorySourceSchema = z.enum(["desktop", "mobile", "remote", "import"]);
export type HistorySource = z.infer<typeof HistorySourceSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string(),
  source: z.string(),
  rawText: z.string(),
  finalText: z.string(),
  postProcessed: z.boolean(),
  promptName: z.string().nullable().optional(),
  audioAvailable: z.boolean(),
  timestamp: z.number().optional(),
  createdAt: z.string().datetime().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const HistoryListResponseSchema = z.array(HistoryEntrySchema);
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;
