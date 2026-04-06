import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
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
import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
import type { Redis } from "ioredis";

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

export type ClaimedOutboxEntry = {
  id: string;
  channel: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  reclaimed: boolean;
};

export type OutboxPublishFailure = {
  id: string;
  channel: string;
  error: string;
};

export type OutboxPublishResult = {
  claimedCount: number;
  publishedCount: number;
  reclaimedCount: number;
  failedEntries: OutboxPublishFailure[];
};

function buildRealtimeChannel(scope: RealtimeScope, id: string) {
  return `pubsub:realtime:${scope}:${id}`;
}

function getDefaultOutboxOwner() {
  return `outbox-poller:${process.pid}`;
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

  await tx.execute(sql`select pg_notify(${env.OUTBOX_NOTIFY_CHANNEL}, '')`);

  return event;
}

export async function claimPendingOutboxEntries(
  limit: number,
  owner: string,
  claimTtlMs: number,
) {
  const claimedEntries = await getDb().execute(
    sql<ClaimedOutboxEntry>`
      with claimable as (
        select
          id,
          channel,
          payload,
          created_at,
          claim_expires_at is not null and claim_expires_at < now() as reclaimed
        from workspace_outbox
        where published_at is null
          and (claim_expires_at is null or claim_expires_at < now())
        order by created_at asc
        limit ${limit}
        for update skip locked
      )
      update workspace_outbox as outbox
      set
        claim_owner = ${owner},
        claimed_at = now(),
        claim_expires_at = now() + (${claimTtlMs} * interval '1 millisecond'),
        publish_attempts = outbox.publish_attempts + 1,
        updated_at = now()
      from claimable
      where outbox.id = claimable.id
      returning
        outbox.id as "id",
        outbox.channel as "channel",
        outbox.payload as "payload",
        outbox.created_at as "createdAt",
        claimable.reclaimed as "reclaimed"
    `,
  );

  return claimedEntries.rows.map((row) => ({
    id: String(row.id),
    channel: String(row.channel),
    payload: row.payload,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date(String(row.createdAt)),
    reclaimed: Boolean(row.reclaimed),
  }));
}

export async function markOutboxEntriesPublished(ids: string[], owner: string) {
  if (ids.length === 0) {
    return;
  }

  await getDb()
    .update(workspaceOutbox)
    .set({
      publishedAt: new Date(),
      claimOwner: null,
      claimedAt: null,
      claimExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(workspaceOutbox.id, ids),
        eq(workspaceOutbox.claimOwner, owner),
        isNull(workspaceOutbox.publishedAt),
      ),
    );
}

export async function releaseOutboxClaims(
  ids: string[],
  owner: string,
  error?: string,
) {
  if (ids.length === 0) {
    return;
  }

  await getDb()
    .update(workspaceOutbox)
    .set({
      claimOwner: null,
      claimedAt: null,
      claimExpiresAt: null,
      ...(error !== undefined ? { lastError: error } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(workspaceOutbox.id, ids),
        eq(workspaceOutbox.claimOwner, owner),
        isNull(workspaceOutbox.publishedAt),
      ),
    );
}

export async function publishPendingOutboxEntries(input?: {
  limit?: number;
  owner?: string;
  redisClient?: Pick<Redis, "publish">;
}) {
  const redis = input?.redisClient ?? getRedisClient();
  const limit = input?.limit ?? env.OUTBOX_BATCH_SIZE;
  const owner = input?.owner ?? getDefaultOutboxOwner();
  const claimedEntries = await claimPendingOutboxEntries(
    limit,
    owner,
    env.OUTBOX_CLAIM_TTL_MS,
  );

  if (claimedEntries.length === 0) {
    return {
      claimedCount: 0,
      publishedCount: 0,
      reclaimedCount: 0,
      failedEntries: [],
    } satisfies OutboxPublishResult;
  }

  const blockedChannels = new Set<string>();
  const failedEntries: OutboxPublishFailure[] = [];
  let publishedCount = 0;

  for (const entry of claimedEntries) {
    if (blockedChannels.has(entry.channel)) {
      await releaseOutboxClaims([entry.id], owner);
      continue;
    }

    try {
      await redis.publish(entry.channel, JSON.stringify(entry.payload));
      await markOutboxEntriesPublished([entry.id], owner);
      publishedCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown outbox publish error";

      blockedChannels.add(entry.channel);
      failedEntries.push({
        id: entry.id,
        channel: entry.channel,
        error: message,
      });
      await releaseOutboxClaims([entry.id], owner, message);
    }
  }

  return {
    claimedCount: claimedEntries.length,
    publishedCount,
    reclaimedCount: claimedEntries.filter((entry) => entry.reclaimed).length,
    failedEntries,
  } satisfies OutboxPublishResult;
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
