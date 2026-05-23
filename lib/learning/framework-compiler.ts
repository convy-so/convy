import { generateStructuredOutput } from "@/lib/ai/runtime";
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

const FRAMEWORK_RUNTIME_METADATA_KEY = "__convyFrameworkRuntime";
const FRAMEWORK_COMPILER_VERSION = "1";
const MIN_FRAMEWORK_GUIDANCE_CHARS = 160;

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
): FrameworkCompileIssue {
  return frameworkCompileIssueSchema.parse({
    code,
    message,
    severity,
  });
}

function lintFramework(framework: ExpertFramework) {
  const issues: FrameworkCompileIssue[] = [];
  const guidanceText = `${framework.description}\n${framework.markdownContent}`.trim();

  if (guidanceText.length < MIN_FRAMEWORK_GUIDANCE_CHARS) {
    issues.push(
      createIssue(
        "insufficient_guidance",
        "Add a fuller teaching framework before publishing. The current guidance is too thin to compile into a dependable tutoring policy.",
        "error",
      ),
    );
  }

  if (!framework.markdownContent.trim()) {
    issues.push(
      createIssue(
        "missing_framework_instructions",
        "Add the main framework instructions in the Markdown field. Description text alone is not enough for a live tutoring policy.",
        "error",
      ),
    );
  }

  if (framework.fewShotExamples.length === 0) {
    issues.push(
      createIssue(
        "missing_few_shots",
        "Few-shot examples are missing. The framework can still run, but examples will improve behavior and expert review alignment.",
        "warning",
      ),
    );
  }

  return issues;
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
        maxOutputTokens: 2200,
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
    const metadata = frameworkRuntimeMetadataSchema.parse({
      compileStatus: "failed",
      compilerVersion: FRAMEWORK_COMPILER_VERSION,
      compiledAt: new Date().toISOString(),
      issues: [
        ...lintIssues,
        createIssue(
          "compile_failed",
          "The framework could not be compiled into a structured tutoring policy. Tighten the framework instructions and try again.",
          "error",
        ),
      ],
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
