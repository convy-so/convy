import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { expertInvitations } from "@/db/schema";
import { defaultAppLocale, isAppLocale, type AppLocale } from "@/lib/i18n/config";

export const EXPERT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ExpertInvitationRecord = typeof expertInvitations.$inferSelect;

function resolveLocale(locale: string | null | undefined): AppLocale {
  return isAppLocale(locale) ? locale : defaultAppLocale;
}

function buildExpiryDate(from = new Date()) {
  return new Date(from.getTime() + EXPERT_INVITATION_TTL_MS);
}

export function isExpertInvitationExpired(invitation: Pick<ExpertInvitationRecord, "expiresAt">) {
  return invitation.expiresAt.getTime() <= Date.now();
}

export async function getExpertInvitationById(invitationId: string) {
  return getDb().query.expertInvitations.findFirst({
    where: eq(expertInvitations.id, invitationId),
  });
}

export async function findPendingExpertInvitationByEmail(email: string) {
  return getDb().query.expertInvitations.findFirst({
    where: and(
      eq(expertInvitations.invitedEmail, email.trim().toLowerCase()),
      eq(expertInvitations.status, "pending"),
    ),
    orderBy: [desc(expertInvitations.createdAt)],
  });
}

export async function findActivePendingExpertInvitationByEmail(email: string) {
  const invitation = await findPendingExpertInvitationByEmail(email);
  if (!invitation || isExpertInvitationExpired(invitation)) {
    return null;
  }
  return invitation;
}

export async function findActivePendingExpertInvitationForUser(params: {
  userId: string;
  email: string;
}) {
  const invitation = await getDb().query.expertInvitations.findFirst({
    where: and(
      eq(expertInvitations.invitedUserId, params.userId),
      eq(expertInvitations.invitedEmail, params.email.trim().toLowerCase()),
      eq(expertInvitations.status, "pending"),
      gt(expertInvitations.expiresAt, new Date()),
    ),
    orderBy: [desc(expertInvitations.createdAt)],
  });

  return invitation ?? null;
}

export async function cancelExpiredPendingExpertInvitationsByEmail(email: string) {
  await getDb()
    .update(expertInvitations)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expertInvitations.invitedEmail, email.trim().toLowerCase()),
        eq(expertInvitations.status, "pending"),
        lte(expertInvitations.expiresAt, new Date()),
      ),
    );
}

export async function createExpertInvitation(params: {
  invitedUserId: string;
  invitedByUserId: string;
  invitedEmail: string;
  locale?: string | null;
}) {
  const normalizedEmail = params.invitedEmail.trim().toLowerCase();

  await cancelExpiredPendingExpertInvitationsByEmail(normalizedEmail);

  const existingPending = await findActivePendingExpertInvitationByEmail(normalizedEmail);
  if (existingPending) {
    throw new Error("An active expert invitation already exists for this email.");
  }

  const now = new Date();
  const [invitation] = await getDb()
    .insert(expertInvitations)
    .values({
      id: randomUUID(),
      invitedUserId: params.invitedUserId,
      invitedByUserId: params.invitedByUserId,
      invitedEmail: normalizedEmail,
      locale: resolveLocale(params.locale),
      status: "pending",
      expiresAt: buildExpiryDate(now),
      lastSentAt: now,
    })
    .returning();

  return invitation;
}

export async function markExpertInvitationCompleted(params: {
  invitedUserId: string;
  email: string;
}) {
  const invitation = await findActivePendingExpertInvitationForUser({
    userId: params.invitedUserId,
    email: params.email,
  });

  if (!invitation) {
    return null;
  }

  const acceptedAt = new Date();
  const [updated] = await getDb()
    .update(expertInvitations)
    .set({
      status: "completed",
      acceptedAt,
      updatedAt: acceptedAt,
    })
    .where(eq(expertInvitations.id, invitation.id))
    .returning();

  return updated ?? null;
}

export async function markExpertInvitationSent(invitationId: string, options?: { refreshExpiry?: boolean }) {
  const now = new Date();
  const [updated] = await getDb()
    .update(expertInvitations)
    .set({
      lastSentAt: now,
      ...(options?.refreshExpiry ? { expiresAt: buildExpiryDate(now) } : {}),
      updatedAt: now,
    })
    .where(eq(expertInvitations.id, invitationId))
    .returning();

  return updated ?? null;
}
