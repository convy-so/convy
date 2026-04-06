import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { respondentAccessTokens } from "@/db/schema";
import { hashIpAddress, hashPrivacyValue } from "@/lib/privacy/compliance";
import { env } from "@/lib/env";

const RESPONDENT_SESSION_TTL_DAYS = 7;
const RESPONDENT_RESUME_TTL_DAYS = 1;
const RESPONDENT_SELF_SERVICE_TTL_DAYS = 7;
const RESPONDENT_COOKIE_PREFIX = "convy_respondent_session_";

export const RESPONDENT_RESUME_QUERY_PARAM = "resume";

export type RespondentAccessTokenScope =
  | "respondent_session"
  | "respondent_resume"
  | "respondent_self_service";

function getDecodedCookieValue(rawValue: string) {
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function getRespondentSessionCookieName(surveyId: string) {
  return `${RESPONDENT_COOKIE_PREFIX}${surveyId}`;
}

export function getRespondentSessionCookieValue(
  cookieHeader: string | null | undefined,
  surveyId: string,
) {
  if (!cookieHeader) {
    return null;
  }

  const cookieName = `${getRespondentSessionCookieName(surveyId)}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName));

  if (!cookie) {
    return null;
  }

  return getDecodedCookieValue(cookie.slice(cookieName.length));
}

export function getRespondentSessionCookieOptions() {
  return {
    path: "/",
    maxAge: RESPONDENT_SESSION_TTL_DAYS * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: env.NODE_ENV === "production",
  };
}

function normalizeUserAgent(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().slice(0, 200);
}

export function buildRespondentFingerprint(input: {
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const ipHash = hashIpAddress(input.ipAddress);
  const normalizedUserAgent = normalizeUserAgent(input.userAgent);
  if (!ipHash && !normalizedUserAgent) {
    return null;
  }

  return hashPrivacyValue(`${ipHash ?? "no-ip"}|${normalizedUserAgent}`);
}

export async function issueRespondentAccessToken(input: {
  surveyId: string;
  conversationId: string;
  participantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  scope?: RespondentAccessTokenScope;
  expiresInDays?: number;
  replaceExistingScope?: boolean;
}) {
  const rawToken = nanoid(40);
  const tokenHash = hashPrivacyValue(rawToken);
  const scope = input.scope ?? "respondent_self_service";
  const expiresInDays =
    input.expiresInDays ??
    (scope === "respondent_resume"
      ? RESPONDENT_RESUME_TTL_DAYS
      : scope === "respondent_session"
        ? RESPONDENT_SESSION_TTL_DAYS
        : RESPONDENT_SELF_SERVICE_TTL_DAYS);

  if (input.replaceExistingScope) {
    await getDb()
      .delete(respondentAccessTokens)
      .where(
        and(
          eq(respondentAccessTokens.surveyId, input.surveyId),
          eq(respondentAccessTokens.conversationId, input.conversationId),
          eq(respondentAccessTokens.scope, scope),
        ),
      );
  }

  await getDb().insert(respondentAccessTokens).values({
    id: nanoid(),
    surveyId: input.surveyId,
    conversationId: input.conversationId,
    participantId: input.participantId ?? null,
    tokenHash,
    scope,
    ipHash: buildRespondentFingerprint({
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }),
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return rawToken;
}

export async function issueRespondentSessionToken(input: {
  surveyId: string;
  conversationId: string;
  participantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return issueRespondentAccessToken({
    ...input,
    scope: "respondent_session",
    replaceExistingScope: true,
  });
}

export async function issueRespondentResumeToken(input: {
  surveyId: string;
  conversationId: string;
  participantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return issueRespondentAccessToken({
    ...input,
    scope: "respondent_resume",
    replaceExistingScope: true,
  });
}

export async function verifyRespondentAccessToken(input: {
  token: string;
  surveyId?: string;
  conversationId?: string;
  allowedScopes?: RespondentAccessTokenScope[];
  clientFingerprint?: string | null;
  consume?: boolean;
}) {
  const tokenHash = hashPrivacyValue(input.token);
  const conditions = [
    eq(respondentAccessTokens.tokenHash, tokenHash),
    isNull(respondentAccessTokens.consumedAt),
    gt(respondentAccessTokens.expiresAt, new Date()),
  ];

  if (input.surveyId) {
    conditions.push(eq(respondentAccessTokens.surveyId, input.surveyId));
  }

  if (input.conversationId) {
    conditions.push(eq(respondentAccessTokens.conversationId, input.conversationId));
  }

  if (input.allowedScopes && input.allowedScopes.length > 0) {
    conditions.push(inArray(respondentAccessTokens.scope, input.allowedScopes));
  }

  const tokenRecord = await getDb().query.respondentAccessTokens.findFirst({
    where: and(...conditions),
  });

  if (!tokenRecord) {
    return null;
  }

  if (tokenRecord.ipHash && input.clientFingerprint && tokenRecord.ipHash !== input.clientFingerprint) {
    return null;
  }

  if (tokenRecord.ipHash && !input.clientFingerprint) {
    return null;
  }

  const shouldRefreshLastUsedAt =
    !tokenRecord.lastUsedAt ||
    Date.now() - tokenRecord.lastUsedAt.getTime() > 5 * 60 * 1000;

  if (input.consume) {
    await getDb()
      .update(respondentAccessTokens)
      .set({
        consumedAt: new Date(),
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(respondentAccessTokens.id, tokenRecord.id));
  } else if (shouldRefreshLastUsedAt) {
    await getDb()
      .update(respondentAccessTokens)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(respondentAccessTokens.id, tokenRecord.id));
  }

  return tokenRecord;
}

export async function resolveRespondentAccess(input: {
  cookieHeader?: string | null;
  surveyId: string;
  conversationId?: string;
  explicitToken?: string | null;
  sessionAllowedScopes?: RespondentAccessTokenScope[];
  explicitAllowedScopes?: RespondentAccessTokenScope[];
  clientIp?: string | null;
  userAgent?: string | null;
}) {
  const clientFingerprint = buildRespondentFingerprint({
    ipAddress: input.clientIp,
    userAgent: input.userAgent,
  });
  const sessionToken = getRespondentSessionCookieValue(
    input.cookieHeader,
    input.surveyId,
  );

  if (sessionToken) {
    const sessionRecord = await verifyRespondentAccessToken({
      token: sessionToken,
      surveyId: input.surveyId,
      conversationId: input.conversationId,
      allowedScopes: input.sessionAllowedScopes ?? ["respondent_session"],
      clientFingerprint,
    });

    if (sessionRecord) {
      return sessionRecord;
    }
  }

  if (!input.explicitToken) {
    return null;
  }

  return verifyRespondentAccessToken({
    token: input.explicitToken,
    surveyId: input.surveyId,
    conversationId: input.conversationId,
    clientFingerprint,
    consume: true,
    allowedScopes:
      input.explicitAllowedScopes ?? [
        "respondent_resume",
        "respondent_self_service",
        "respondent_session",
      ],
  });
}
