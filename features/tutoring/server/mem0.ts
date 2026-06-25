import MemoryClient from "mem0ai";

import { env } from "@/shared/config/server-env";
import type { LearningPatternObservation } from "@/features/tutoring/server/pattern-types";

type Mem0MemoryRecord = {
  id?: string;
  memory?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};
const MEM0_API_VERSION = "v2";
const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 8;

let mem0Client: unknown = null;
type Mem0Method = (...args: unknown[]) => unknown;

function isReflectTarget(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function getObjectProperty(target: object, propertyKey: string): unknown {
  return Reflect.get(target, propertyKey);
}

function isMem0Method(value: unknown): value is Mem0Method {
  return typeof value === "function";
}

function requireMem0Config() {
  if (!env.MEM0_API_KEY) {
    throw new Error("MEM0_API_KEY is required for learning-pattern analysis.");
  }

  return {
    apiKey: env.MEM0_API_KEY,
    api_key: env.MEM0_API_KEY,
    ...(env.MEM0_ORG_ID ? { orgId: env.MEM0_ORG_ID } : {}),
    ...(env.MEM0_ORG_ID ? { org_id: env.MEM0_ORG_ID } : {}),
    ...(env.MEM0_PROJECT_ID ? { projectId: env.MEM0_PROJECT_ID } : {}),
    ...(env.MEM0_PROJECT_ID ? { project_id: env.MEM0_PROJECT_ID } : {}),
  };
}

export function isMem0Configured() {
  return Boolean(env.MEM0_API_KEY);
}

export function getMem0Client() {
  if (!mem0Client) {
    mem0Client = new MemoryClient(requireMem0Config());
  }

  return mem0Client;
}

function getClientMethod(client: unknown, methodName: string) {
  if (!isReflectTarget(client)) {
    return null;
  }

  const candidate = getObjectProperty(client, methodName);
  if (!isMem0Method(candidate)) {
    return null;
  }

  return (...args: unknown[]) => Promise.resolve(candidate.call(client, ...args));
}

async function callClientMethod(client: unknown, methodName: string, ...args: unknown[]) {
  const method = getClientMethod(client, methodName);
  if (!method) {
    throw new Error(`Mem0 SDK method "${methodName}" is not available.`);
  }

  return await method(...args);
}

function isMem0MemoryRecord(value: unknown): value is Mem0MemoryRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const id = getObjectProperty(value, "id");
  const memory = getObjectProperty(value, "memory");
  const createdAt = getObjectProperty(value, "created_at");
  const updatedAt = getObjectProperty(value, "updated_at");
  const metadata = getObjectProperty(value, "metadata");

  return (
    (id === undefined || typeof id === "string") &&
    (memory === undefined || typeof memory === "string") &&
    (createdAt === undefined || typeof createdAt === "string") &&
    (updatedAt === undefined || typeof updatedAt === "string") &&
    (metadata === undefined || (typeof metadata === "object" && metadata !== null))
  );
}

function toMem0MemoryRecords(value: unknown): Mem0MemoryRecord[] {
  return Array.isArray(value) ? value.filter(isMem0MemoryRecord) : [];
}

function isMem0Reference(value: unknown): value is { id?: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const id = getObjectProperty(value, "id");
  return id === undefined || typeof id === "string";
}

function toMem0References(value: unknown): Array<{ id?: string }> {
  return Array.isArray(value) ? value.filter(isMem0Reference) : [];
}

async function tryCall<T>(attempts: Array<() => Promise<T>>) {
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Mem0 SDK call failed.");
}

export async function listLearningPatternMemories(params: {
  studentUserId: string;
  scopeType?: "global" | "subject";
  subjectKey?: string | null;
  memoryClass?: "observation" | "playbook";
  limit?: number;
}) {
  const client = getMem0Client();
  const listLimit = params.limit ?? DEFAULT_LIST_LIMIT;
  const payload = {
    filters: { AND: [{ user_id: params.studentUserId }] },
    page: 1,
    page_size: Math.max(listLimit, DEFAULT_LIST_LIMIT),
    version: MEM0_API_VERSION,
  };

  const result = await tryCall<unknown>([
    async () => await callClientMethod(client, "get_all", payload),
    async () => await callClientMethod(client, "getAll", payload),
    async () =>
      await callClientMethod(client, "get_all", payload.filters, {
        page: payload.page,
        page_size: payload.page_size,
        version: payload.version,
      }),
    async () =>
      await callClientMethod(client, "getAll", payload.filters, {
        page: payload.page,
        page_size: payload.page_size,
        version: payload.version,
      }),
  ]);

  const records = toMem0MemoryRecords(result);
  return records
    .filter((memory) => {
      const metadata = memory.metadata ?? {};
      if (params.scopeType && metadata.scopeType !== params.scopeType) return false;
      if (params.subjectKey && metadata.subjectKey !== params.subjectKey) return false;
      if (params.memoryClass && metadata.memoryClass !== params.memoryClass) {
        return false;
      }
      return true;
    })
    .slice(0, listLimit);
}

export async function searchLearningPatternMemories(params: {
  studentUserId: string;
  query: string;
  scopeType?: "global" | "subject";
  subjectKey?: string | null;
  limit?: number;
}) {
  const client = getMem0Client();
  const filters: Record<string, unknown>[] = [{ user_id: params.studentUserId }];

  if (params.scopeType) {
    filters.push({ metadata: { scopeType: params.scopeType } });
  }

  if (params.subjectKey) {
    filters.push({ metadata: { subjectKey: params.subjectKey } });
  }

  const options = {
    user_id: params.studentUserId,
    version: MEM0_API_VERSION,
    limit: params.limit ?? DEFAULT_SEARCH_LIMIT,
    filters: { AND: filters },
  };

  const result = await tryCall<unknown>([
    async () => await callClientMethod(client, "search", params.query, options),
    async () =>
      await callClientMethod(client, "search", params.query, params.studentUserId, {
        version: MEM0_API_VERSION,
        limit: options.limit,
        filters: options.filters,
      }),
  ]);

  return toMem0MemoryRecords(result);
}

export async function addLearningPatternObservations(params: {
  studentUserId: string;
  sourceType: "onboarding" | "session";
  sourceId: string;
  classroomId?: string | null;
  classroomStudentId?: string | null;
  topicId?: string | null;
  sourceCreatedAt?: string | null;
  observations: LearningPatternObservation[];
}) {
  const client = getMem0Client();
  const references: Array<Record<string, unknown>> = [];

  for (const observation of params.observations) {
    const messages = [
      {
        role: "user",
        content: observation.text,
      },
    ];

      const sharedMetadata = {
        classroomId: params.classroomId ?? null,
        classroomStudentId: params.classroomStudentId ?? null,
      topicId: params.topicId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceCreatedAt: params.sourceCreatedAt ?? null,
      scopeType: observation.scopeType,
      subjectKey: observation.subjectKey ?? null,
      memoryClass: observation.memoryClass,
      dimension: observation.dimension,
      patternConfidence: observation.patternConfidence,
      ...observation.metadata,
    };

    const result = await tryCall<unknown>([
      async () =>
        await callClientMethod(client, "add", messages, {
          user_id: params.studentUserId,
          infer: false,
          version: MEM0_API_VERSION,
          metadata: sharedMetadata,
        }),
      async () =>
        await callClientMethod(client, "add", messages, params.studentUserId, {
          infer: false,
          version: MEM0_API_VERSION,
          metadata: sharedMetadata,
        }),
    ]);
    const referencesResult = toMem0References(result);

    references.push({
      scopeType: observation.scopeType,
      subjectKey: observation.subjectKey ?? null,
      memoryClass: observation.memoryClass,
      dimension: observation.dimension,
      patternConfidence: observation.patternConfidence,
      memoryIds: referencesResult.map((item) => item.id).filter(Boolean),
    });
  }

  return references;
}

export async function deleteLearningPatternMemoriesForUser(studentUserId: string) {
  const client = getMem0Client();

  await tryCall<unknown>([
    async () =>
      await callClientMethod(client, "delete_all", {
        filters: { AND: [{ user_id: studentUserId }] },
        version: MEM0_API_VERSION,
      }),
    async () =>
      await callClientMethod(client, "deleteAll", {
        filters: { AND: [{ user_id: studentUserId }] },
        version: MEM0_API_VERSION,
      }),
    async () =>
      await callClientMethod(client, "delete", {
        filters: { AND: [{ user_id: studentUserId }] },
        version: MEM0_API_VERSION,
      }),
  ]);
}
