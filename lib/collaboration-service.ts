import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb, type DbClient } from "@/db";
import {
  collaborationEvents,
  surveyCollaborationComments,
  surveyEditLeases,
  surveyRevisions,
  surveys,
  workspaceOutbox,
  workspaceRevisions,
} from "@/db/schema";
import { getRedisClient } from "@/lib/redis";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

const DEFAULT_LEASE_DURATION_MS = 30_000;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export type RealtimeScope = "workspace" | "survey";

export type RecordedRealtimeEvent = {
  id: string;
  scope: RealtimeScope;
  revision: number;
  eventType: string;
  workspaceId: string | null;
  surveyId: string | null;
  actorId: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

function buildRealtimeChannel(scope: RealtimeScope, id: string) {
  return `pubsub:realtime:${scope}:${id}`;
}

async function nextWorkspaceRevision(tx: DbTransaction, workspaceId: string) {
  const [row] = await tx
    .insert(workspaceRevisions)
    .values({
      workspaceId,
      revision: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceRevisions.workspaceId,
      set: {
        revision: sql`${workspaceRevisions.revision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ revision: workspaceRevisions.revision });

  return row.revision;
}

async function nextSurveyRevision(tx: DbTransaction, surveyId: string) {
  const [survey] = await tx
    .select({ organizationId: surveys.organizationId })
    .from(surveys)
    .where(eq(surveys.id, surveyId));

  const [row] = await tx
    .insert(surveyRevisions)
    .values({
      surveyId,
      workspaceRevision: 0,
      surveyRevision: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: surveyRevisions.surveyId,
      set: {
        surveyRevision: sql`${surveyRevisions.surveyRevision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ revision: surveyRevisions.surveyRevision });

  return {
    revision: row.revision,
    workspaceId: survey?.organizationId ?? null,
  };
}

export async function recordRealtimeEvent(
  tx: DbTransaction,
  input: {
    scope: RealtimeScope;
    workspaceId?: string | null;
    surveyId?: string | null;
    eventType: string;
    actorId: string;
    payload: Record<string, unknown>;
  },
): Promise<RecordedRealtimeEvent> {
  let revision = 0;
  let workspaceId = input.workspaceId ?? null;
  const surveyId = input.surveyId ?? null;

  if (input.scope === "workspace") {
    if (!workspaceId) {
      throw new Error("workspaceId is required for workspace-scoped events");
    }
    revision = await nextWorkspaceRevision(tx, workspaceId);
  } else {
    if (!surveyId) {
      throw new Error("surveyId is required for survey-scoped events");
    }
    const result = await nextSurveyRevision(tx, surveyId);
    revision = result.revision;
    workspaceId = workspaceId ?? result.workspaceId;
  }

  const eventId = nanoid();
  const createdAt = new Date();
  const event: RecordedRealtimeEvent = {
    id: eventId,
    scope: input.scope,
    revision,
    eventType: input.eventType,
    workspaceId,
    surveyId,
    actorId: input.actorId,
    createdAt: createdAt.toISOString(),
    payload: input.payload,
  };

  await tx.insert(collaborationEvents).values({
    id: event.id,
    workspaceId: event.workspaceId,
    surveyId: event.surveyId,
    scope: event.scope,
    revision: event.revision,
    eventType: event.eventType,
    actorId: event.actorId,
    payload: event.payload,
    createdAt,
    updatedAt: createdAt,
  });

  const channelId = input.scope === "workspace" ? workspaceId : surveyId;
  if (!channelId) {
    throw new Error("channel id missing for realtime event");
  }

  await tx.insert(workspaceOutbox).values({
    id: nanoid(),
    workspaceId: event.workspaceId,
    surveyId: event.surveyId,
    scope: event.scope,
    channel: buildRealtimeChannel(event.scope, channelId),
    eventType: event.eventType,
    payload: {
      ...event,
      payload: event.payload,
    },
    createdAt,
    updatedAt: createdAt,
  });

  return event;
}

export async function publishPendingOutboxEntries(limit = 100) {
  const redis = getRedisClient();
  await getDb().transaction(async (tx) => {
    const claimedEntries = await tx.execute(
      sql<{
        id: string;
        channel: string;
        payload: Record<string, unknown>;
      }>`
        select id, channel, payload
        from workspace_outbox
        where published_at is null
        order by created_at asc
        limit ${limit}
        for update skip locked
      `,
    );

    if (claimedEntries.rows.length === 0) {
      return;
    }

    for (const row of claimedEntries.rows) {
      const entryId = String(row.id);
      const entryChannel = String(row.channel);
      const entryPayload = row.payload;

      await redis.publish(entryChannel, JSON.stringify(entryPayload));
      await tx
        .update(workspaceOutbox)
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaceOutbox.id, entryId));
    }
  });
}

export async function getWorkspaceRealtimeEvents(
  workspaceId: string,
  afterRevision = 0,
) {
  return await getDb()
    .select()
    .from(collaborationEvents)
    .where(
      and(
        eq(collaborationEvents.scope, "workspace"),
        eq(collaborationEvents.workspaceId, workspaceId),
        gt(collaborationEvents.revision, afterRevision),
      ),
    )
    .orderBy(asc(collaborationEvents.revision));
}

export async function getSurveyRealtimeEvents(
  surveyId: string,
  afterRevision = 0,
) {
  return await getDb()
    .select()
    .from(collaborationEvents)
    .where(
      and(
        eq(collaborationEvents.scope, "survey"),
        eq(collaborationEvents.surveyId, surveyId),
        gt(collaborationEvents.revision, afterRevision),
      ),
    )
    .orderBy(asc(collaborationEvents.revision));
}

export async function getCurrentWorkspaceRevision(workspaceId: string) {
  const [row] = await getDb()
    .select({ revision: workspaceRevisions.revision })
    .from(workspaceRevisions)
    .where(eq(workspaceRevisions.workspaceId, workspaceId));

  return row?.revision ?? 0;
}

export async function getCurrentSurveyRevision(surveyId: string) {
  const [row] = await getDb()
    .select({ revision: surveyRevisions.surveyRevision })
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
  const permission = await getSurveyPermissionContext(input.userId, input.surveyId);
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
      existing.holderUserId !== permission.creatorId;
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
  if (lease.holderUserId !== input.userId || lease.leaseToken !== input.leaseToken) {
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
  if (lease.holderUserId !== input.userId || lease.leaseToken !== input.leaseToken) {
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

export async function getSurveyComments(
  surveyId: string,
  contextType: "creation" | "rehearsal",
  contextId: string,
) {
  return await getDb()
    .select()
    .from(surveyCollaborationComments)
    .where(
      and(
        eq(surveyCollaborationComments.surveyId, surveyId),
        eq(surveyCollaborationComments.contextType, contextType),
        eq(surveyCollaborationComments.contextId, contextId),
        isNull(surveyCollaborationComments.deletedAt),
      ),
    )
    .orderBy(asc(surveyCollaborationComments.createdAt));
}
