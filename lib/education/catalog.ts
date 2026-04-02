import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  EDUCATION_PROGRAM_IDS,
  coverageNodeSchema,
  type EducationProgramAssets,
  type EducationProgramId,
  type EducationProgramManifest,
} from "./types";

const BASE_DIR = path.join(process.cwd(), "programs", "education");
const SKILLS_DIR = path.join(process.cwd(), "skills");
const cache = new Map<EducationProgramId, EducationProgramAssets>();

const educationProgramManifestSchema = z.object({
  id: z.enum(EDUCATION_PROGRAM_IDS),
  displayName: z.string(),
  description: z.string(),
  routing: z.object({
    keywords: z.array(z.string()),
    examples: z.array(z.string()),
  }),
  requiredBriefFields: z.array(z.string()),
  defaultDurationMinutes: z.number(),
  analyticsDimensions: z.array(z.string()),
  policyFlags: z.object({
    allowSensitiveTopics: z.boolean(),
    requiresConsent: z.boolean(),
    piiMaskingRequired: z.boolean(),
  }),
  nodes: z.array(coverageNodeSchema),
}) as z.ZodType<EducationProgramManifest>;

type Phase = "creation" | "conducting" | "analytics";

function slugFromProgramId(programId: EducationProgramId): string {
  return programId.replace("education.", "").replace(/_/g, "-");
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8").trim();
}

function readMarkdownBody(filePath: string): string {
  const raw = readText(filePath);
  return raw.replace(/^---[\s\S]*?---\s*/, "").trim();
}

function getSkillPath(phase: Phase): string {
  switch (phase) {
    case "creation":
      return path.join(SKILLS_DIR, "education-research-design", "SKILL.md");
    case "conducting":
      return path.join(SKILLS_DIR, "education-interview-conducting", "SKILL.md");
    case "analytics":
      return path.join(SKILLS_DIR, "education-analytics-synthesis", "SKILL.md");
  }
}

function getSkillReferencePaths(phase: Phase): string[] {
  switch (phase) {
    case "creation":
      return [
        path.join(SKILLS_DIR, "education-research-design", "references", "student-feedback-language.md"),
      ];
    case "conducting":
      return [
        path.join(SKILLS_DIR, "education-interview-conducting", "references", "interview-quality.md"),
      ];
    case "analytics":
      return [
        path.join(SKILLS_DIR, "education-analytics-synthesis", "references", "evidence-reporting.md"),
      ];
  }
}

function buildPhasePrompt(input: {
  manifest: EducationProgramManifest;
  programDir: string;
  phase: Phase;
}): string {
  const skillInstruction = readMarkdownBody(getSkillPath(input.phase));
  const skillReferences = getSkillReferencePaths(input.phase)
    .map((filePath) => readText(filePath))
    .join("\n\n");
  const programReference = readText(
    path.join(input.programDir, "references", `${input.phase}.md`),
  );
  const exampleReference = readText(
    path.join(input.programDir, "references", "examples.md"),
  );

  return [
    "<system-skill>",
    skillInstruction,
    "</system-skill>",
    "<shared-reference>",
    skillReferences,
    "</shared-reference>",
    `<program-context id="${input.manifest.id}" name="${input.manifest.displayName}">`,
    `Description: ${input.manifest.description}`,
    `Analytics dimensions: ${input.manifest.analyticsDimensions.join(", ")}`,
    `Default duration minutes: ${input.manifest.defaultDurationMinutes}`,
    `Policy flags: consent=${input.manifest.policyFlags.requiresConsent}; pii_masking=${input.manifest.policyFlags.piiMaskingRequired}; sensitive_topics=${input.manifest.policyFlags.allowSensitiveTopics}`,
    programReference,
    "</program-context>",
    "<examples>",
    exampleReference,
    "</examples>",
  ].join("\n\n");
}

function loadProgram(programId: EducationProgramId): EducationProgramAssets {
  const cached = cache.get(programId);
  if (cached) return cached;

  const slug = slugFromProgramId(programId);
  const dir = path.join(BASE_DIR, slug);
  const manifest = educationProgramManifestSchema.parse(JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"),
  ));
  const assets: EducationProgramAssets = {
    manifest,
    creationPrompt: buildPhasePrompt({ manifest, programDir: dir, phase: "creation" }),
    conductingPrompt: buildPhasePrompt({ manifest, programDir: dir, phase: "conducting" }),
    analyticsPrompt: buildPhasePrompt({ manifest, programDir: dir, phase: "analytics" }),
  };
  cache.set(programId, assets);
  return assets;
}

export function getEducationProgram(programId: EducationProgramId): EducationProgramAssets {
  return loadProgram(programId);
}

export function listEducationPrograms(): EducationProgramAssets[] {
  return EDUCATION_PROGRAM_IDS.map((programId) => loadProgram(programId));
}

export function classifyEducationProgramHeuristically(input: string): {
  programId: EducationProgramId;
  confidence: number;
  rationale: string;
} {
  const text = input.toLowerCase();
  const scores = listEducationPrograms().map((program) => {
    const keywordHits = program.manifest.routing.keywords.filter((keyword) =>
      text.includes(keyword.toLowerCase()),
    );
    const exampleHits = program.manifest.routing.examples.filter((example) =>
      text.includes(example.toLowerCase().slice(0, 18)),
    );
    const score = keywordHits.length * 2 + exampleHits.length;
    return {
      programId: program.manifest.id,
      score,
      rationale:
        keywordHits.length > 0
          ? `Matched keywords: ${keywordHits.join(", ")}`
          : "Fallback to education default",
    };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= 0) {
    return {
      programId: "education.course_efficacy",
      confidence: 0.3,
      rationale: "No strong program signals found; defaulted to course efficacy.",
    };
  }

  return {
    programId: best.programId,
    confidence: Math.min(0.95, 0.45 + best.score * 0.1),
    rationale: best.rationale,
  };
}
