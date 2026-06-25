import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb, type DbClient } from "@/shared/db";
import {
  surveyEditLeases,
  surveyRevisions,
} from "@/shared/db/schema";
import { getSurveyPermissionContext } from "@/features/surveys/public-server";
import { requireValue } from "@/shared/utils/collections";

const DEFAULT_LEASE_DURATION_MS = 30_000;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

async function nextSurveyRevision(tx: DbTransaction, surveyId: string) {
  const [row] = await tx
    .insert(surveyRevisions)
    .values({
      surveyId,
      revision: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: surveyRevisions.surveyId,
      set: {
        revision: sql`${surveyRevisions.revision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ revision: surveyRevisions.revision });

  return requireValue(
    row,
    `Failed to increment survey revision for survey ${surveyId}`,
  ).revision;
}

export async function incrementSurveyRevision(surveyId: string) {
  return await getDb().transaction(async (tx) => {
    const revision = await nextSurveyRevision(tx, surveyId);
    return revision;
  });
}

export async function getCurrentSurveyRevision(surveyId: string) {
  const [row] = await getDb()
    .select({ revision: surveyRevisions.revision })
    .from(surveyRevisions)
    .where(eq(surveyRevisions.surveyId, surveyId));

  return row?.revision ?? 0;
}

export async function getActiveSurveyLease(
  surveyId: string,
  stage: "creation" | "rehearsal",
) {
  const [lease] = await getDb()
    .select()
    .from(surveyEditLeases)
    .where(
      and(
        eq(surveyEditLeases.surveyId, surveyId),
        eq(surveyEditLeases.stage, stage),
      ),
    );

  if (!lease) return null;
  if (lease.expiresAt.getTime() <= Date.now()) {
    await getDb()
      .delete(surveyEditLeases)
      .where(
        and(
          eq(surveyEditLeases.surveyId, surveyId),
          eq(surveyEditLeases.stage, stage),
        ),
      );
    return null;
  }

  return lease;
}

export async function acquireSurveyLease(input: {
  surveyId: string;
  stage: "creation" | "rehearsal";
  userId: string;
  sessionId?: string | null;
  force?: boolean;
}) {
  const permission = await getSurveyPermissionContext(
    input.userId,
    input.surveyId,
  );
  if (!permission || !permission.canEdit) {
    return { ok: false as const, error: "EDITOR_ACCESS_REQUIRED" };
  }

  const existing = await getActiveSurveyLease(input.surveyId, input.stage);
  const expiresAt = new Date(Date.now() + DEFAULT_LEASE_DURATION_MS);
  const leaseToken = nanoid();

  if (existing && existing.holderUserId !== input.userId) {
    const canForce =
      Boolean(input.force) &&
      permission.isSurveyCreator &&
      existing.holderUserId !== permission.ownerId;
    if (!canForce) {
      return {
        ok: false as const,
        error: "LEASE_CONFLICT",
        lease: existing,
      };
    }
  }

  await getDb()
    .insert(surveyEditLeases)
    .values({
      surveyId: input.surveyId,
      stage: input.stage,
      holderUserId: input.userId,
      holderSessionId: input.sessionId ?? null,
      leaseToken,
      expiresAt,
      lastHeartbeatAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [surveyEditLeases.surveyId, surveyEditLeases.stage],
      set: {
        holderUserId: input.userId,
        holderSessionId: input.sessionId ?? null,
        leaseToken,
        expiresAt,
        lastHeartbeatAt: new Date(),
      },
    });

  return {
    ok: true as const,
    lease: {
      surveyId: input.surveyId,
      stage: input.stage,
      holderUserId: input.userId,
      holderSessionId: input.sessionId ?? null,
      leaseToken,
      expiresAt,
    },
  };
}

export async function renewSurveyLease(input: {
  surveyId: string;
  stage: "creation" | "rehearsal";
  userId: string;
  leaseToken: string;
}) {
  const lease = await getActiveSurveyLease(input.surveyId, input.stage);
  if (!lease) {
    return { ok: false as const, error: "LEASE_NOT_FOUND" };
  }
  if (
    lease.holderUserId !== input.userId ||
    lease.leaseToken !== input.leaseToken
  ) {
    return { ok: false as const, error: "LEASE_CONFLICT", lease };
  }

  const expiresAt = new Date(Date.now() + DEFAULT_LEASE_DURATION_MS);
  await getDb()
    .update(surveyEditLeases)
    .set({
      expiresAt,
      lastHeartbeatAt: new Date(),
    })
    .where(
      and(
        eq(surveyEditLeases.surveyId, input.surveyId),
        eq(surveyEditLeases.stage, input.stage),
      ),
    );

  return {
    ok: true as const,
    lease: {
      ...lease,
      expiresAt,
      lastHeartbeatAt: new Date(),
    },
  };
}

export async function releaseSurveyLease(input: {
  surveyId: string;
  stage: "creation" | "rehearsal";
  userId: string;
  leaseToken: string;
}) {
  const lease = await getActiveSurveyLease(input.surveyId, input.stage);
  if (!lease) {
    return { ok: true as const };
  }
  if (
    lease.holderUserId !== input.userId ||
    lease.leaseToken !== input.leaseToken
  ) {
    return { ok: false as const, error: "LEASE_CONFLICT", lease };
  }

  await getDb()
    .delete(surveyEditLeases)
    .where(
      and(
        eq(surveyEditLeases.surveyId, input.surveyId),
        eq(surveyEditLeases.stage, input.stage),
      ),
    );

  return { ok: true as const };
}
