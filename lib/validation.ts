
import { type SurveyObjective, type SurveyTargetAudience, type SurveyScope, type SurveySuccessCriteria, type SurveyConstraints, type SurveyHypotheses, type SurveyMedia } from "@/db/schema";
import { getDomainById } from "./domain-expertise-loader";

// Type definition matching the Zod schema in route.ts
type ExtractedData = {
  objective?: SurveyObjective | null;
  targetAudience?: SurveyTargetAudience | null;
  scope?: SurveyScope | null;
  successCriteria?: SurveySuccessCriteria | null;
  constraints?: SurveyConstraints | null;
  hypotheses?: SurveyHypotheses | null;
  tone?: "formal" | "casual" | "playful" | "empathetic" | null;
  requiredQuestions?: string[] | null;
  metrics?: string[] | null;
  personalInfo?: string[] | null;
  domainId?: number | null;
  media?: {
    type: "image" | "audio" | "video";
    description: string;
    contextForUse: string;
    priority?: "high" | "medium" | "low" | null;
  }[] | null;
};

export type ValidationIssue = {
  field: keyof ExtractedData | string;
  issue: string;
  severity: "critical" | "warning";
};

export function validateExtractedData(data: ExtractedData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Domain Consistency Check
  if (data.domainId) {
    const domain = getDomainById(data.domainId);
    if (!domain) {
      issues.push({
        field: "domainId",
        issue: `Invalid Domain ID: ${data.domainId}`,
        severity: "critical"
      });
    }
  }

  // 2. Logic Consistency: Objective vs Scope
  if (data.objective && data.scope) {
      if (data.scope.breadthVsDepth === "deep" && (!data.objective.goal || data.objective.goal.length < 20)) {
          issues.push({
              field: "objective.goal",
              issue: "Deep scope surveys require a detailed goal description.",
              severity: "warning"
          });
      }
  }

  // 3. Media Validation
  if (data.media && data.media.length > 0) {
      data.media.forEach((m, idx) => {
          if (m.type === "video" || m.type === "audio") {
              if (data.constraints?.timeLimit && data.constraints.timeLimit < 5) {
                   issues.push({
                       field: `media[${idx}]`,
                       issue: "Video/Audio media included but survey time limit is very short (< 5 mins).",
                       severity: "warning"
                   });
              }
          }
      });
  }

  return issues;
}
