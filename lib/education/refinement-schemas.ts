import { z } from "zod";

export const researchBriefPatchSchema = z.object({
  setFields: z.record(z.string(), z.unknown()).default({}),
  addRequiredTopics: z.array(z.string()).default([]),
  removeRequiredTopics: z.array(z.string()).default([]),
  addSuccessCriteria: z.array(z.string()).default([]),
  removeSuccessCriteria: z.array(z.string()).default([]),
  addAnalysisQuestions: z.array(z.string()).default([]),
  removeAnalysisQuestions: z.array(z.string()).default([]),
  note: z.string().default(""),
});

export type ResearchBriefPatch = z.infer<typeof researchBriefPatchSchema>;

export const refinementProposalTypeSchema = z.enum([
  "conducting_profile",
  "brief_patch",
]);

export const refinementProposalSchema = z.object({
  id: z.string(),
  type: refinementProposalTypeSchema,
  title: z.string(),
  originalRequest: z.string(),
  interpretation: z.string(),
  runtimeEffect: z.array(z.string()).default([]),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type RefinementProposal = z.infer<typeof refinementProposalSchema>;

export const refinementMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export type RefinementMessage = z.infer<typeof refinementMessageSchema>;
