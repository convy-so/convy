import { generateStructuredOutput } from "@/lib/ai/runtime";
import { frameworkCompileCriteria } from "@/lib/learning/framework-compile-criteria";
import { buildFrameworkCompilerPrompt } from "@/lib/learning/prompts/framework-compiler";
import {
  compiledFrameworkPolicySchema,
  frameworkCompileIssueSchema,
  frameworkRuntimeMetadataSchema,
  type CompiledFrameworkPolicy,
  type ExpertFramework,
  type FrameworkCompileIssue,
  type FrameworkRuntimeMetadata,
} from "@/lib/learning/types";
import { z } from "zod";

const FRAMEWORK_RUNTIME_METADATA_KEY = "__convyFrameworkRuntime";
const FRAMEWORK_COMPILER_VERSION = "1";
const MIN_FRAMEWORK_GUIDANCE_CHARS = 160;
const MAX_COMPILE_DIAGNOSTIC_ISSUES = 6;
const FRAMEWORK_COMPILE_OUTPUT_TOKENS = 3600;

function slugifySegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function createIssue(
  code: string,
  message: string,
  severity: "warning" | "error",
  path = "",
  details = "",
  suggestion = "",
): FrameworkCompileIssue {
  return frameworkCompileIssueSchema.parse({
    code,
    message,
    path,
    details,
    suggestion,
    severity,
  });
}

function lintFramework(framework: ExpertFramework) {
  const issues: FrameworkCompileIssue[] = [];
  const guidanceText = `${framework.description}\n${framework.markdownContent}`.trim();
  const normalizedGuidance = guidanceText.toLowerCase();

  if (guidanceText.length < MIN_FRAMEWORK_GUIDANCE_CHARS) {
    issues.push(
      createIssue(
        "insufficient_guidance",
        "Add a fuller teaching framework before publishing. The current guidance is too thin to compile into a dependable tutoring policy.",
        "error",
        "framework",
        "The compiler needs enough concrete instruction to infer progression, assessment, capability usage, and completion rules.",
        "Add more specific operational guidance, not just a short philosophy statement.",
      ),
    );
  }

  if (!framework.markdownContent.trim()) {
    issues.push(
      createIssue(
        "missing_framework_instructions",
        "Add the main framework instructions in the Markdown field. Description text alone is not enough for a live tutoring policy.",
        "error",
        "markdownContent",
        "The compiler treats the Markdown field as the main source of runtime teaching rules.",
        "Move the core teaching framework into the Markdown instructions section.",
      ),
    );
  }

  if (framework.fewShotExamples.length === 0) {
    issues.push(
      createIssue(
        "missing_few_shots",
        "Few-shot examples are missing. The framework can still run, but examples will improve behavior and expert review alignment.",
        "warning",
        "fewShotExamples",
        "The runtime can compile without examples, but examples make the tutor's turn-by-turn behavior more faithful to the framework.",
        "Add a handful of short examples showing diagnosis, misconception handling, transfer, and closing.",
      ),
    );
  }

  for (const criterion of frameworkCompileCriteria) {
    const found = criterion.keywords.some((keyword) =>
      normalizedGuidance.includes(keyword.toLowerCase()),
    );

    if (found) continue;

    issues.push(
      createIssue(
        criterion.code,
        `${criterion.title} is not explicit enough in the framework.`,
        criterion.blocking ? "error" : "warning",
        "markdownContent",
        criterion.whyItMatters,
        criterion.instruction,
      ),
    );
  }

  return issues;
}

function extractErrorDetails(error: unknown): string {
  if (!error) return "";

  const visited = new Set<unknown>();
  const messages: string[] = [];

  function walk(value: unknown) {
    if (!value || visited.has(value)) return;
    visited.add(value);

    if (value instanceof Error) {
      if (value.message) {
        messages.push(value.message.trim());
      }

      const cause = (value as Error & { cause?: unknown }).cause;
      if (cause) walk(cause);
      return;
    }

    if (typeof value === "string") {
      messages.push(value.trim());
      return;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.message === "string") {
        messages.push(record.message.trim());
      }
      if (record.cause) {
        walk(record.cause);
      }
    }
  }

  walk(error);

  return [...new Set(messages.filter(Boolean))].join(" | ");
}

function isNoStructuredOutputError(errorDetails: string) {
  const normalized = errorDetails.toLowerCase();
  return (
    normalized.includes("no output generated") ||
    normalized.includes("failed to generate") ||
    normalized.includes("did not generate")
  );
}

const frameworkFailureDiagnosticsSchema = z.object({
  issues: z
    .array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        path: z.string().default(""),
        details: z.string().default(""),
        suggestion: z.string().default(""),
        severity: z.enum(["warning", "error"]).default("error"),
      }),
    )
    .max(MAX_COMPILE_DIAGNOSTIC_ISSUES)
    .default([]),
});

type StructuredFailureSignal = {
  code: string;
  path: string;
  rawMessage: string;
};

function extractStructuredFailureSignals(error: unknown): StructuredFailureSignal[] {
  const collected = new Map<string, StructuredFailureSignal>();
  const visited = new Set<unknown>();

  function addSignal(path: string, rawMessage: string, rawCode: string) {
    const normalizedPath = path || "compiledPolicy";
    const normalizedMessage =
      rawMessage || "The structured runtime policy failed validation.";
    const normalizedCode = rawCode || "validation";
    const key = `${normalizedPath}:${normalizedCode}:${normalizedMessage}`;
    if (collected.has(key)) return;
    collected.set(key, {
      code: normalizedCode,
      path: normalizedPath,
      rawMessage: normalizedMessage,
    });
  }

  function walk(value: unknown) {
    if (!value || visited.has(value)) return;
    visited.add(value);

    if (value instanceof z.ZodError) {
      value.issues.forEach((issue) => {
        addSignal(formatIssuePath(issue.path), issue.message, issue.code);
      });
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;

    if (Array.isArray(record.issues)) {
      for (const issue of record.issues) {
        if (issue && typeof issue === "object") {
          const issueRecord = issue as Record<string, unknown>;
          addSignal(
            formatIssuePath(issueRecord.path),
            typeof issueRecord.message === "string"
              ? issueRecord.message
              : "The structured runtime policy failed validation.",
            typeof issueRecord.code === "string" ? issueRecord.code : "validation",
          );
        }
      }
    }

    if (record.cause) walk(record.cause);
    if (record.error) walk(record.error);
    if (record.value) walk(record.value);
  }

  walk(error);

  return Array.from(collected.values()).slice(0, MAX_COMPILE_DIAGNOSTIC_ISSUES);
}

async function diagnoseCompileFailure(
  framework: ExpertFramework,
  errorDetails: string,
  structuredSignals: StructuredFailureSignal[],
): Promise<FrameworkCompileIssue[]> {
  try {
    const structuredSignalsText =
      structuredSignals.length > 0
        ? structuredSignals
            .map(
              (signal, index) =>
                `${index + 1}. path=${signal.path} | code=${signal.code} | raw=${signal.rawMessage}`,
            )
            .join("\n")
        : "(none)";

    const diagnostics = await generateStructuredOutput({
      schema: frameworkFailureDiagnosticsSchema,
      prompt: `You are diagnosing why an expert-authored tutoring framework failed to compile into a structured runtime policy.

The runtime policy needs to infer:
- phases or teaching progression
- levels or rungs of learner progress
- turn-by-turn teaching rules
- assessment and evidence-of-understanding rules
- completion or close conditions
- tool and media policy

Return only grounded issues that are visible in the framework text or implied by the compile failure. Do not invent implementation details.

Your explanation must be custom to this framework. Do not give vague advice like "be more explicit" unless you also name what is missing, conflicting, or overloaded and where the problem is showing up.

For each issue:
- set path to the affected runtime area when possible, such as phases, levels, turnPolicy, toolPolicy, assessmentPolicy, completionPolicy, or compiledPolicy
- explain exactly what in the framework is causing the problem
- reference the relevant section or pattern from the framework when possible
- provide a concrete fix that this expert can apply to this specific framework

If the observed compile failure says no output was generated, consider causes like:
- the framework is too long or diffuse for one structured compile pass
- operating protocol and concept detail are mixed together too heavily
- a section is conceptually strong but not operational enough for runtime extraction

Prefer a small number of precise issues over a long generic list.

Framework name:
${framework.name}

Framework description:
${framework.description || "(none)"}

Framework instructions:
${framework.markdownContent || "(none)"}

Few-shot examples:
${framework.fewShotExamples.length > 0 ? framework.fewShotExamples.join("\n\n---\n\n") : "(none)"}

Observed structured validation signals:
${structuredSignalsText}

Observed compile failure:
${errorDetails || "The compiler could not produce a valid structured runtime policy."}`,
      maxOutputTokens: 900,
    });

    return diagnostics.issues.map((issue) =>
      createIssue(
        issue.code,
        issue.message,
        issue.severity,
        issue.path,
        issue.details,
        issue.suggestion,
      ),
    );
  } catch {
    return [];
  }
}

function dedupeIssues(issues: FrameworkCompileIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatIssuePath(path: unknown): string {
  if (!Array.isArray(path)) return "";
  const segments = path
    .map((segment) =>
      typeof segment === "string" || typeof segment === "number"
        ? String(segment)
        : "",
    )
    .filter(Boolean);
  return segments.join(".");
}

function describeStructuredPath(path: string) {
  if (!path) {
    return {
      message: "The compiler returned a structured policy that did not match the required runtime schema.",
      suggestion:
        "Make the framework sections more explicit so the compiler can infer a valid runtime policy shape.",
    };
  }

  if (path.startsWith("phases")) {
    return {
      message: "The compiler could not infer a valid teaching phase sequence.",
      suggestion:
        "Add explicit named phases or session steps, plus what each phase is for and how the tutor moves between them.",
    };
  }

  if (path.startsWith("levels")) {
    return {
      message: "The compiler could not infer valid learner progression levels or rungs.",
      suggestion:
        "Name the levels or rungs explicitly and describe what each one means and what counts as advancement.",
    };
  }

  if (path.startsWith("turnPolicy")) {
    return {
      message: "The compiler could not infer a stable turn-by-turn teaching policy.",
      suggestion:
        "State what should happen first in a turn, whether student attempts are required before direct answers, and whether questions should come before explanation.",
    };
  }

  if (path.startsWith("toolPolicy")) {
    return {
      message: "The compiler could not infer clear tool or media usage rules.",
      suggestion:
        "Say whether images, videos, quizzes, grading, or notebook work should be used often, rarely, or never.",
    };
  }

  if (path.startsWith("assessmentPolicy")) {
    return {
      message: "The compiler could not infer clear assessment or evidence-of-understanding rules.",
      suggestion:
        "Explain how the tutor should tell that the student understands, and whether assessment is required before advancing or closing.",
    };
  }

  if (path.startsWith("completionPolicy")) {
    return {
      message: "The compiler could not infer clear session completion rules.",
      suggestion:
        "State what must happen before a session can close, such as transfer, reflection, or explicit proof of understanding.",
    };
  }

  if (path === "defaultPhaseId" || path === "defaultLevelId") {
    return {
      message: "The compiler could not determine a stable default starting phase or level.",
      suggestion:
        "Make the opening phase and starting learner level explicit in the framework's progression description.",
    };
  }

  return {
    message: `The compiler could not validate the structured policy field '${path}'.`,
    suggestion:
      "Clarify the corresponding part of the framework so the compiler can infer that runtime field reliably.",
  };
}

function extractStructuredFailureIssues(error: unknown): FrameworkCompileIssue[] {
  return extractStructuredFailureSignals(error).map((signal) => {
    const descriptor = describeStructuredPath(signal.path);
    return createIssue(
      `structured_${signal.code || "validation"}`,
      descriptor.message,
      "error",
      signal.path,
      signal.rawMessage,
      descriptor.suggestion,
    );
  });
}

function normalizeCompiledPolicy(policy: CompiledFrameworkPolicy) {
  const phases = policy.phases.map((phase, index) => ({
    ...phase,
    id: phase.id?.trim() ? phase.id.trim() : `phase-${index + 1}`,
  }));
  const levels = policy.levels.map((level, index) => ({
    ...level,
    id: level.id?.trim() ? level.id.trim() : `level-${index + 1}`,
  }));

  const uniquePhaseIds = new Set<string>();
  const dedupedPhases = phases.map((phase) => {
    let id = slugifySegment(phase.id);
    let suffix = 2;
    while (uniquePhaseIds.has(id)) {
      id = `${slugifySegment(phase.id)}-${suffix}`;
      suffix += 1;
    }
    uniquePhaseIds.add(id);
    return { ...phase, id };
  });

  const uniqueLevelIds = new Set<string>();
  const dedupedLevels = levels.map((level) => {
    let id = slugifySegment(level.id);
    let suffix = 2;
    while (uniqueLevelIds.has(id)) {
      id = `${slugifySegment(level.id)}-${suffix}`;
      suffix += 1;
    }
    uniqueLevelIds.add(id);
    return { ...level, id };
  });

  const normalizedDefaultPhaseId = slugifySegment(policy.defaultPhaseId);
  const normalizedDefaultLevelId = slugifySegment(policy.defaultLevelId);

  const defaultPhaseId = uniquePhaseIds.has(normalizedDefaultPhaseId)
    ? normalizedDefaultPhaseId
    : dedupedPhases[0]?.id ?? "phase-1";
  const defaultLevelId = uniqueLevelIds.has(normalizedDefaultLevelId)
    ? normalizedDefaultLevelId
    : dedupedLevels[0]?.id ?? "level-1";

  return compiledFrameworkPolicySchema.parse({
    ...policy,
    phases: dedupedPhases,
    levels: dedupedLevels,
    defaultPhaseId,
    defaultLevelId,
  });
}

export function readFrameworkRuntimeMetadata(
  framework: Pick<ExpertFramework, "metadata"> | null | undefined,
): FrameworkRuntimeMetadata | null {
  const raw =
    framework &&
    typeof framework.metadata === "object" &&
    framework.metadata !== null
      ? framework.metadata[FRAMEWORK_RUNTIME_METADATA_KEY]
      : undefined;

  const parsed = frameworkRuntimeMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function writeFrameworkRuntimeMetadata(
  framework: ExpertFramework,
  metadata: FrameworkRuntimeMetadata,
): ExpertFramework {
  return {
    ...framework,
    metadata: {
      ...(framework.metadata ?? {}),
      [FRAMEWORK_RUNTIME_METADATA_KEY]: frameworkRuntimeMetadataSchema.parse(metadata),
    },
  };
}

export async function compileFrameworkArtifact(framework: ExpertFramework) {
  const lintIssues = lintFramework(framework);
  const hasBlockingLint = lintIssues.some((issue) => issue.severity === "error");

  if (hasBlockingLint) {
    const metadata = frameworkRuntimeMetadataSchema.parse({
      compileStatus: "failed",
      compilerVersion: FRAMEWORK_COMPILER_VERSION,
      compiledAt: new Date().toISOString(),
      issues: lintIssues,
      compiledPolicy: null,
    });

    return {
      framework: writeFrameworkRuntimeMetadata(framework, metadata),
      metadata,
    };
  }

  try {
    const compiledPolicy = normalizeCompiledPolicy(
      await generateStructuredOutput({
        schema: compiledFrameworkPolicySchema,
        prompt: buildFrameworkCompilerPrompt(framework),
        maxOutputTokens: FRAMEWORK_COMPILE_OUTPUT_TOKENS,
      }),
    );

    const metadata = frameworkRuntimeMetadataSchema.parse({
      compileStatus: "ready",
      compilerVersion: FRAMEWORK_COMPILER_VERSION,
      compiledAt: new Date().toISOString(),
      issues: lintIssues,
      compiledPolicy,
    });

    return {
      framework: writeFrameworkRuntimeMetadata(framework, metadata),
      metadata,
    };
  } catch (error) {
    const errorDetails = extractErrorDetails(error);
    const structuredFailureSignals = extractStructuredFailureSignals(error);
    const structuredFailureIssues = extractStructuredFailureIssues(error);
    const diagnosticIssues = await diagnoseCompileFailure(
      framework,
      errorDetails,
      structuredFailureSignals,
    );
    const specificIssues =
      diagnosticIssues.length > 0 ? diagnosticIssues : structuredFailureIssues;
    const metadata = frameworkRuntimeMetadataSchema.parse({
      compileStatus: "failed",
      compilerVersion: FRAMEWORK_COMPILER_VERSION,
      compiledAt: new Date().toISOString(),
      issues: dedupeIssues([
        ...lintIssues,
        ...specificIssues,
        ...(isNoStructuredOutputError(errorDetails)
          && specificIssues.length === 0
          ? [
              createIssue(
                "no_structured_output",
                "The compiler could not produce any structured runtime policy from this framework draft.",
                "error",
                "compiledPolicy",
                "This usually means the framework is too broad, too repetitive, too long for one pass, or not explicit enough about the runtime sections the platform must extract.",
                "Keep the framework focused on operating protocol. Make phases, levels, turn rules, assessment rules, completion rules, and tool/media boundaries explicit. If concept detail is loaded separately, avoid repeating that detail inside the framework body.",
              ),
            ]
          : []),
        ...(specificIssues.length === 0
          ? [
              createIssue(
                "compile_failed",
                "The framework could not be compiled into a structured tutoring policy.",
                "error",
                "compiledPolicy",
                errorDetails ||
                  "The structured compiler could not turn the current wording into the required runtime fields.",
                "Make the runtime-operational sections clearer, then save a new draft.",
              ),
            ]
          : []),
      ]),
      compiledPolicy: null,
    });

    return {
      framework: writeFrameworkRuntimeMetadata(framework, metadata),
      metadata,
      error,
    };
  }
}

export function ensureFrameworkPolicyReady(framework: ExpertFramework) {
  const metadata = readFrameworkRuntimeMetadata(framework);
  if (!metadata || metadata.compileStatus !== "ready" || !metadata.compiledPolicy) {
    return null;
  }

  return metadata.compiledPolicy;
}
