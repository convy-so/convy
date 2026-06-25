import { env } from "@/shared/config/server-env";

export type SubprocessorRegistryEntry = {
  id: string;
  name: string;
  category: "monitoring" | "email" | "ai" | "storage" | "queue" | "translation";
  enabled: boolean;
};

export const subprocessorRegistry: SubprocessorRegistryEntry[] = [
  {
    id: "sentry",
    name: "Sentry",
    category: "monitoring",
    enabled: Boolean(env.SENTRY_DSN),
  },
  {
    id: "resend",
    name: "Resend",
    category: "email",
    enabled: Boolean(env.RESEND_API_KEY),
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    enabled: Boolean(env.OPENAI_API_KEY),
  },
  {
    id: "google",
    name: "Google AI",
    category: "ai",
    enabled: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),
  },
  {
    id: "deepgram",
    name: "Deepgram",
    category: "ai",
    enabled: Boolean(env.DEEPGRAM_API_KEY),
  },
  {
    id: "supabase",
    name: "Supabase Storage",
    category: "storage",
    enabled: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.convy_supabase_secret_key),
  },
  {
    id: "upstash",
    name: "Upstash Redis",
    category: "queue",
    enabled: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  },
  {
    id: "mem0",
    name: "Mem0",
    category: "ai",
    enabled: Boolean(env.MEM0_API_KEY),
  },
];

export function getEnabledSubprocessorIds() {
  return subprocessorRegistry.filter((entry) => entry.enabled).map((entry) => entry.id);
}

export function getRuntimeProcessorViolations() {
  if (!env.GDPR_EU_MODE) {
    return [];
  }

  const approved = new Set(env.GDPR_EU_APPROVED_PROCESSORS);
  return getEnabledSubprocessorIds().filter((processorId) => !approved.has(processorId));
}
