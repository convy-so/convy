import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel } from "@/shared/ai";
import {
  buildOnboardingLearningPatternAnalysisPrompt,
  buildSessionLearningPatternAnalysisPrompt,
} from "@/features/tutoring/server/prompts/student-pattern-analysis";
import {
  learningPatternAnalysisOutputSchema,
  type StudentPatternProfile,
} from "@/features/tutoring/server/pattern-types";
import type {
  StudentSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/features/tutoring/public-server";

import {
  sortProfilesForStorage,
  withNormalizedProfile,
} from "./pattern-profile-utils";

const profileSummarySchema = z.object({
  teacherSummary: z.string(),
  studentSummary: z.string(),
});

type MemoryRecord = {
  id?: string;
  memory?: string;
  metadata?: Record<string, unknown>;
};

function buildPatternSummaryRewritePrompt(input: {
  profile: StudentPatternProfile;
  studentName: string;
}) {
  return `Write two summaries of a student's learning pattern profile.

Student: ${input.studentName}
Profile:
${JSON.stringify(input.profile)}

Rules:
- teacherSummary: practical, plain-language, directly useful for teaching
- studentSummary: supportive, non-clinical, describes tendencies not fixed identity
- mention confidence level implicitly when the profile is still early
- do not contradict the profile`;
}

function formatMemoryRecall(memories: MemoryRecord[]) {
  if (memories.length === 0) return "none";

  return memories
    .slice(0, 20)
    .map((memory, index) => {
      const metadata =
        memory.metadata && Object.keys(memory.metadata).length > 0
          ? JSON.stringify(memory.metadata)
          : "{}";
      return `${index + 1}. ${memory.memory ?? ""}\nmetadata: ${metadata}`;
    })
    .join("\n\n");
}

function formatTranscript(
  messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> | null }>,
) {
  return messages
    .map((message) => {
      const meta =
        message.metadata && Object.keys(message.metadata).length > 0
          ? ` metadata=${JSON.stringify(message.metadata)}`
          : "";
      return `${message.role}${meta}: ${message.content}`;
    })
    .join("\n\n");
}

export async function analyzeOnboardingLearningPatterns(params: {
  studentName: string;
  studentUserId: string;
  classroomStudentId: string;
  interestProfile: StudentInterestProfile;
  transcript: Array<{ role: string; content: string }>;
  currentProfiles: StudentPatternProfile[];
  relevantMemories: MemoryRecord[];
}) {
  const prompt = buildOnboardingLearningPatternAnalysisPrompt({
    studentName: params.studentName,
    interestProfileJson: JSON.stringify(params.interestProfile),
    currentProfilesJson: JSON.stringify(sortProfilesForStorage(params.currentProfiles)),
    relevantMemoriesText: formatMemoryRecall(params.relevantMemories),
    transcriptText: formatTranscript(params.transcript),
  });

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: learningPatternAnalysisOutputSchema,
    }),
    maxOutputTokens: 1400,
    prompt,
  });

  return {
    profiles: output.profiles.map((profile) =>
      withNormalizedProfile({
        ...profile,
        scopeType: "global",
        subjectKey: null,
        patternConfidence: Math.min(profile.patternConfidence, 0.25),
      }),
    ),
    observations: output.observations,
  };
}

export async function analyzeSessionLearningPatterns(params: {
  studentName: string;
  subjectKey: string;
  subjectLabel: string;
  lessonTitle: string;
  interestProfile: StudentInterestProfile;
  state: StudentSessionState;
  report: TeacherProgressReport;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  outOfSessionEvidence: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  currentProfiles: StudentPatternProfile[];
  relevantMemories: MemoryRecord[];
}) {
  const prompt = buildSessionLearningPatternAnalysisPrompt({
    studentName: params.studentName,
    subjectKey: params.subjectKey,
    subjectLabel: params.subjectLabel,
    lessonTitle: params.lessonTitle,
    interestProfileJson: JSON.stringify(params.interestProfile),
    currentProfilesJson: JSON.stringify(sortProfilesForStorage(params.currentProfiles)),
    relevantMemoriesText: formatMemoryRecall(params.relevantMemories),
    reportJson: JSON.stringify(params.report),
    stateJson: JSON.stringify(params.state),
    transcriptText: formatTranscript(params.transcript),
    outOfSessionEvidenceText: formatTranscript(params.outOfSessionEvidence),
  });

  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: learningPatternAnalysisOutputSchema,
    }),
    maxOutputTokens: 1800,
    prompt,
  });

  return {
    profiles: output.profiles.map((profile) =>
      withNormalizedProfile(
        profile.scopeType === "subject"
          ? {
              ...profile,
              subjectKey: params.subjectKey,
            }
          : {
              ...profile,
              subjectKey: null,
            },
      ),
    ),
    observations: output.observations,
  };
}

export async function rewritePatternSummaries(params: {
  profile: StudentPatternProfile;
  studentName: string;
}) {
  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: profileSummarySchema,
    }),
    prompt: buildPatternSummaryRewritePrompt(params),
  });

  return output;
}

