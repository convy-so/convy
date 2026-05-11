import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  sampleFeedbackEntries,
  sampleFeedbackPatches,
  surveyConductingProfiles,
} from "@/db/schema";
import type {
  SampleConductingProfile,
  SampleFeedbackEntryInput,
  SampleFeedbackPatch,
} from "../sample-feedback";

export async function createSampleFeedbackEntry(params: {
  surveyId: string;
  sampleConversationId: string | null;
  conversationNumber: number;
  createdBy: string;
  feedbackInput: SampleFeedbackEntryInput;
}) {
  const [created] = await getDb()
    .insert(sampleFeedbackEntries)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      sampleConversationId: params.sampleConversationId,
      conversationNumber: params.conversationNumber,
      createdBy: params.createdBy,
      feedbackInput: params.feedbackInput,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function createSampleFeedbackPatch(params: {
  surveyId: string;
  feedbackEntryId: string;
  conversationNumber: number;
  status: string;
  patch: SampleFeedbackPatch;
}) {
  const [created] = await getDb()
    .insert(sampleFeedbackPatches)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      feedbackEntryId: params.feedbackEntryId,
      conversationNumber: params.conversationNumber,
      status: params.status,
      patch: params.patch,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function replaceConductingProfile(params: {
  surveyId: string;
  mode: "sample" | "live";
  sourcePatchId?: string | null;
  profile: SampleConductingProfile;
}) {
  await getDb()
    .update(surveyConductingProfiles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(surveyConductingProfiles.surveyId, params.surveyId),
        eq(surveyConductingProfiles.mode, params.mode),
      ),
    );

  const [created] = await getDb()
    .insert(surveyConductingProfiles)
    .values({
      id: nanoid(),
      surveyId: params.surveyId,
      mode: params.mode,
      version: params.profile.version,
      sourcePatchId: params.sourcePatchId ?? null,
      profile: params.profile,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function getActiveConductingProfile(
  surveyId: string,
  mode: "sample" | "live",
) {
  const [profile] = await getDb()
    .select()
    .from(surveyConductingProfiles)
    .where(
      and(
        eq(surveyConductingProfiles.surveyId, surveyId),
        eq(surveyConductingProfiles.mode, mode),
        eq(surveyConductingProfiles.isActive, true),
      ),
    )
    .orderBy(desc(surveyConductingProfiles.version));
  return profile ?? null;
}
