import {
  patternConfidenceLabelSchema,
  studentPatternProfileSchema,
  type StudentPatternProfile,
} from "@/features/tutoring/server/pattern-types";
import {
  TUTORING_SUBJECT_DEFAULTS,
  PATTERN_CONFIDENCE_LABEL,
} from "@/shared/tutoring/constants";

const WELL_SUPPORTED_CONFIDENCE_THRESHOLD = 0.7;
const EMERGING_CONFIDENCE_THRESHOLD = 0.3;
const CONFIDENCE_PERCENT_SCALE = 100;
const LOW_CONFIDENCE_CAP = 0.25;
const MISCONCEPTION_CONFIDENCE_FLOOR = 0.35;
const MISCONCEPTION_CONFIDENCE_CAP = 0.2;

function isoNow() {
  return new Date().toISOString();
}

export function normalizeSubjectKey(value: string | null | undefined) {
  const normalized = (value ?? TUTORING_SUBJECT_DEFAULTS.key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || TUTORING_SUBJECT_DEFAULTS.key;
}

export function deriveSubjectInfo(params: {
  subjectKey?: string | null;
  subjectLabel?: string | null;
  subject?: string | null;
}) {
  const label =
    params.subjectLabel?.trim() ||
    params.subject?.trim() ||
    TUTORING_SUBJECT_DEFAULTS.label;
  const key = normalizeSubjectKey(params.subjectKey || label);

  return {
    subjectKey: key,
    subjectLabel: label,
  };
}

export function confidenceToPercent(confidence: number) {
  return Math.max(
    0,
    Math.min(CONFIDENCE_PERCENT_SCALE, Math.round(confidence * CONFIDENCE_PERCENT_SCALE)),
  );
}

export function getPatternConfidenceLabel(confidence: number) {
  if (confidence >= WELL_SUPPORTED_CONFIDENCE_THRESHOLD) {
    return PATTERN_CONFIDENCE_LABEL.WELL_SUPPORTED;
  }
  if (confidence >= EMERGING_CONFIDENCE_THRESHOLD) {
    return PATTERN_CONFIDENCE_LABEL.EMERGING;
  }
  return PATTERN_CONFIDENCE_LABEL.EARLY;
}

export function buildConfidenceByDimension(profile: StudentPatternProfile) {
  return {
    firstSessionDiscovery: profile.patternConfidence,
    explanationApproaches:
      profile.explanationApproaches[0]?.confidence ?? profile.patternConfidence,
    interestResonance:
      profile.interestResonance.domains[0]?.comprehensionScore ??
      profile.patternConfidence,
    cognitivePattern: profile.cognitivePattern.confidence,
    motivationalPattern: profile.patternConfidence,
    confidenceMindsetPattern:
      profile.confidenceMindsetPattern.requiresConfidenceBuilding ||
      profile.confidenceMindsetPattern.confidenceHistory.length > 0
        ? profile.patternConfidence
        : Math.min(profile.patternConfidence, LOW_CONFIDENCE_CAP),
    persistentMisconceptions:
      profile.persistentMisconceptions.length > 0
        ? Math.max(profile.patternConfidence, MISCONCEPTION_CONFIDENCE_FLOOR)
        : Math.min(profile.patternConfidence, MISCONCEPTION_CONFIDENCE_CAP),
  };
}

export function defaultLearningPatternProfile(params: {
  scopeType: "global" | "subject";
  subjectKey?: string | null;
  subjectLabel?: string | null;
}) {
  return studentPatternProfileSchema.parse({
    scopeType: params.scopeType,
    subjectKey:
      params.scopeType === "subject"
        ? params.subjectKey ?? TUTORING_SUBJECT_DEFAULTS.key
        : null,
    subjectLabel:
      params.scopeType === "subject"
        ? params.subjectLabel ?? TUTORING_SUBJECT_DEFAULTS.label
        : null,
    patternConfidence: 0,
    confidenceLabel: PATTERN_CONFIDENCE_LABEL.EARLY,
    onboardingObservations: "",
    studentSummary: "",
    teacherSummary: "",
    updatedAt: isoNow(),
  });
}

export function withNormalizedProfile(profile: StudentPatternProfile) {
  const confidence = Math.max(0, Math.min(1, profile.patternConfidence));
  return studentPatternProfileSchema.parse({
    ...profile,
    patternConfidence: confidence,
    confidenceLabel: patternConfidenceLabelSchema.parse(
      getPatternConfidenceLabel(confidence),
    ),
    updatedAt: profile.updatedAt || isoNow(),
  });
}

export function sortProfilesForStorage(profiles: StudentPatternProfile[]) {
  return [...profiles].sort((a, b) => {
    if (a.scopeType === b.scopeType) return 0;
    return a.scopeType === "global" ? -1 : 1;
  });
}

