import { z } from "zod";

import { learningSessionStateSchema, teacherProgressReportSchema } from "@/lib/learning/types";
import {
  assessmentQuestionTypeSchema,
  curriculumFrameworkKeySchema,
  reasoningGoalSchema,
  subjectCompetencySchema,
  transferExpectationSchema,
} from "@/lib/learning/subject-packages";
import { appLocales } from "@/lib/i18n/config";

const classroomSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  defaultContentLocale: z.enum(appLocales),
  gradeBand: z.string(),
  gradeLabel: z.string(),
  status: z.string(),
  teacherUserId: z.string(),
  teacherName: z.string(),
  accessLevel: z.literal("owner"),
  accessRequestStatus: z.string().nullable(),
  studentCount: z.number(),
  topicCount: z.number(),
});

const classroomStudentSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  inviteStatus: z.string(),
  onboardingStatus: z.string(),
  profileLastUpdated: z.string().nullable(),
});

const topicSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    contentLocale: z.enum(appLocales).optional(),
    subjectKey: z.string().optional(),
    subjectLabel: z.string().optional(),
    status: z.string(),
  })
  .passthrough();

const topicMaterialSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  materialKind: z.string(),
  extractionStatus: z.string(),
  indexingStatus: z.string(),
  mimeType: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  analysis: z.record(z.string(), z.unknown()).optional(),
});

const readinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()),
  gaps: z.array(z.string()),
  strengths: z.array(z.string()),
});

const learningStudentMembershipSchema = z.object({
  classroomStudentId: z.string(),
  fullName: z.string(),
  classroom: z.object({
    id: z.string(),
    title: z.string(),
    gradeBand: z.string(),
    gradeLabel: z.string(),
  }),
  needsOnboarding: z.boolean(),
  profileLastUpdated: z.string().nullable(),
  topics: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subject: z.string().nullable().optional(),
      subjectKey: z.string().optional(),
      subjectLabel: z.string().optional(),
      status: z.string(),
    }),
  ),
  surveys: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      isVoice: z.boolean(),
      shareableLink: z.string(),
      createdAt: z.string().nullable(),
      responseStatus: z.enum(["not_started", "in_progress", "completed"]),
      completedAt: z.string().nullable(),
    }),
  ),
});

const learningMeSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("student"),
    student: z.array(learningStudentMembershipSchema),
  }),
  z.object({
    role: z.literal("non-student"),
    student: z.null(),
  }),
]);

const onboardingMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.union([z.string(), z.date()]).optional(),
});

const onboardingStateSchema = z.discriminatedUnion("completed", [
  z.object({
    completed: z.literal(true),
    profile: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  z.object({
    completed: z.literal(false),
    sessionId: z.string(),
    messages: z.array(onboardingMessageSchema),
  }),
]);

const tutoringSessionSchema = z.object({
  sessionId: z.string(),
  sessionLocale: z.enum(appLocales).optional(),
  sourceLocale: z.enum(appLocales).optional(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    subject: z.string().nullable().optional(),
    subjectKey: z.string().optional(),
    subjectLabel: z.string().optional(),
  }),
  sessionState: learningSessionStateSchema,
  messages: z.array(onboardingMessageSchema),
});

const patternSchema = z.object({
  scopeType: z.string(),
  subjectKey: z.string().nullable().optional(),
  subjectLabel: z.string().nullable().optional(),
  patternConfidence: z.number().default(0),
  explanationApproaches: z.array(z.record(z.string(), z.unknown())).optional(),
  interestResonance: z.record(z.string(), z.unknown()).optional(),
  cognitivePattern: z.record(z.string(), z.unknown()).optional(),
  motivationalPattern: z.record(z.string(), z.unknown()).optional(),
  confidenceMindsetPattern: z.record(z.string(), z.unknown()).optional(),
  summaryLocale: z.string().optional(),
  persistentMisconceptions: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        lastSeenAt: z.string().default(""),
      }),
    )
    .default([]),
  studentSummary: z.string(),
  teacherSummary: z.string().optional(),
  confidenceLabel: z.string(),
  updatedAt: z.union([z.string(), z.date()]),
  engagementTrend: z.record(z.string(), z.unknown()).optional(),
  motivationalContext: z.record(z.string(), z.unknown()).optional(),
  knowledgeStateModel: z.array(z.record(z.string(), z.unknown())).optional(),
  cognitiveStyleCalibration: z.record(z.string(), z.unknown()).optional(),
  productiveStruggleCalibration: z.record(z.string(), z.unknown()).optional(),
  longitudinalDevelopment: z.record(z.string(), z.unknown()).optional(),
});

const teacherPatternResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    student: z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.string().email(),
    }),
    profiles: z.array(patternSchema),
  }),
});

export type LearningMeData = z.infer<typeof learningMeSchema>;

const studentPatternResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(patternSchema),
});

const studentOverviewSchema = z.object({
  success: z.literal(true),
  data: z.object({
    student: z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.string().email(),
      inviteStatus: z.string(),
      onboardingStatus: z.string(),
      profileLastUpdated: z.string().nullable(),
      classroom: z.object({
        id: z.string(),
        title: z.string(),
        gradeBand: z.string(),
        gradeLabel: z.string(),
      }),
    }),
    topics: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        subject: z.string().nullable().optional(),
        subjectKey: z.string().optional(),
        subjectLabel: z.string().optional(),
        status: z.string(),
        reportCount: z.number(),
        contentLocale: z.enum(appLocales).optional(),
        latestMasteryPercent: z.number().nullable(),
        latestReportAt: z.string().nullable(),
      }),
    ),
    recentReports: z.array(
      z.object({
        id: z.string(),
        topicId: z.string(),
        topicTitle: z.string(),
        masteryPercent: z.number(),
        sourceLocale: z.string().optional(),
        createdAt: z.union([z.string(), z.date()]),
        updatedAt: z.union([z.string(), z.date()]),
        report: teacherProgressReportSchema,
      }),
    ),
    recentInteractions: z.array(
      z.object({
        id: z.string(),
        topicId: z.string().nullable(),
        topicTitle: z.string().nullable(),
        sessionId: z.string().nullable(),
        interactionType: z.string(),
        role: z.string(),
        content: z.string(),
        createdAt: z.union([z.string(), z.date()]),
      }),
    ),
  }),
});

const topicOverviewSchema = z.object({
  success: z.literal(true),
  data: z.object({
    topic: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      subject: z.string().nullable().optional(),
      contentLocale: z.enum(appLocales).optional(),
      subjectKey: z.string(),
      subjectLabel: z.string(),
      status: z.string(),
      classroom: z.object({
        id: z.string(),
        title: z.string(),
        gradeBand: z.string(),
        gradeLabel: z.string(),
      }),
    }),
    reportCount: z.number(),
    questionCount: z.number(),
    activeStudentCount: z.number(),
  }),
});

const activationValidationSchema = z.object({
  valid: z.boolean(),
  student: z
    .object({
      fullName: z.string(),
      email: z.string().email(),
    })
    .optional(),
  classroom: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .optional(),
  expiresAt: z.string().optional(),
});

const bulkInviteStudentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    invited: z.array(
      z.object({
        id: z.string(),
        classroomId: z.string(),
        fullName: z.string(),
        email: z.string().email(),
        inviteStatus: z.string(),
      }),
    ),
    failed: z.array(
      z.object({
        fullName: z.string(),
        email: z.string().email(),
        error: z.string(),
      }),
    ),
  }),
});

const classroomAssignedSurveyProgressSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  shareableLink: z.string().nullable(),
  createdAt: z.string().nullable(),
  assignedCount: z.number(),
  completedCount: z.number(),
  inProgressCount: z.number(),
  notStartedCount: z.number(),
  completionRate: z.number(),
  students: z.array(
    z.object({
      classroomStudentId: z.string(),
      fullName: z.string(),
      email: z.string().email(),
      inviteStatus: z.string(),
      onboardingStatus: z.string(),
      responseStatus: z.enum(["not_started", "in_progress", "completed"]),
      completedAt: z.string().nullable(),
    }),
  ),
});

const learningInterventionSchema = z.object({
  id: z.string(),
  classroomId: z.string(),
  classroomStudentId: z.string(),
  topicId: z.string().nullable(),
  interventionType: z.enum([
    "reteach",
    "check_in",
    "practice",
    "family_follow_up",
  ]),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["planned", "in_progress", "completed", "dismissed"]),
  title: z.string(),
  notes: z.string().nullable(),
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  student: z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string().email(),
  }),
});

function getApiErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  if (payload instanceof Error) {
    return payload.message;
  }

  if (!("error" in payload)) {
    return null;
  }

  const error = payload.error;
  return typeof error === "string" ? error : null;
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) ?? "Request failed");
  }

  return schema.parse(payload);
}

export async function fetchLearningMe() {
  return await parseResponse(
    await fetch("/api/learning/me", { credentials: "include" }),
    learningMeSchema,
  );
}

export async function fetchTeacherClassrooms() {
  return await parseResponse(
    await fetch("/api/learning/classrooms", { credentials: "include" }),
    z.object({ success: z.literal(true), data: z.array(classroomSchema) }),
  );
}

export async function createClassroom(input: {
  title: string;
  description?: string;
  subject?: string;
  gradeLabel: string;
  defaultContentLocale?: (typeof appLocales)[number];
}) {
  return await parseResponse(
    await fetch("/api/learning/classrooms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        id: z.string(),
        title: z.string(),
        gradeBand: z.string(),
        gradeLabel: z.string(),
        accessLevel: z.literal("owner"),
        defaultContentLocale: z.enum(appLocales),
      }),
    }),
  );
}

export async function fetchClassroomStudents(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/students`, {
      credentials: "include",
    }),
    z.object({ success: z.literal(true), data: z.array(classroomStudentSchema) }),
  );
}

export async function inviteStudent(input: {
  classroomId: string;
  fullName: string;
  email: string;
}) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${input.classroomId}/students`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        id: z.string(),
        classroomId: z.string(),
        fullName: z.string(),
        email: z.string().email(),
        inviteStatus: z.string(),
      }),
    }),
  );
}

export async function inviteStudentsBulk(input: {
  classroomId: string;
  students: Array<{
    fullName: string;
    email: string;
  }>;
}) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${input.classroomId}/students`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: input.students }),
    }),
    bulkInviteStudentsResponseSchema,
  );
}

export async function fetchClassroomTopics(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/topics`, {
      credentials: "include",
    }),
    z.object({ success: z.literal(true), data: z.array(topicSchema) }),
  );
}

export async function createTopic(input: {
  classroomId: string;
  title: string;
  description?: string;
  subject?: string;
  subjectKey?: string;
  subjectLabel?: string;
  learningOutcomes: Array<{
    id?: string;
    title: string;
    description: string;
    evidenceSignals?: string[];
    masteryThreshold?: number;
    competencyTargets?: Array<z.infer<typeof subjectCompetencySchema>>;
    reasoningGoals?: Array<z.infer<typeof reasoningGoalSchema>>;
    misconceptionTags?: string[];
    questionModes?: Array<z.infer<typeof assessmentQuestionTypeSchema>>;
    transferExpectation?: z.infer<typeof transferExpectationSchema>;
    curriculumFrameworkKey?: z.infer<typeof curriculumFrameworkKeySchema>;
  }>;
  sourceBoundary?: Record<string, unknown>;
  contentLocale?: (typeof appLocales)[number];
}) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${input.classroomId}/topics`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        id: z.string(),
        classroomId: z.string(),
        title: z.string(),
        learningOutcomeCount: z.number(),
        contentLocale: z.enum(appLocales),
      }),
    }),
  );
}

export async function fetchTopicMaterials(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/materials`, {
      credentials: "include",
    }),
    z.object({ success: z.literal(true), data: z.array(topicMaterialSchema) }),
  );
}

export async function fetchClassroomAssignedSurveys(classroomId: string) {
  return await parseResponse(
    await fetch(`/api/learning/classrooms/${classroomId}/assigned-surveys`, {
      credentials: "include",
    }),
    z.object({
      success: z.literal(true),
      data: z.array(classroomAssignedSurveyProgressSchema),
    }),
  );
}

export async function fetchLearningInterventions(input: {
  classroomId: string;
  topicId?: string;
  classroomStudentId?: string;
}) {
  const searchParams = new URLSearchParams({
    classroomId: input.classroomId,
  });

  if (input.topicId) {
    searchParams.set("topicId", input.topicId);
  }

  if (input.classroomStudentId) {
    searchParams.set("classroomStudentId", input.classroomStudentId);
  }

  return await parseResponse(
    await fetch(`/api/learning/interventions?${searchParams.toString()}`, {
      credentials: "include",
    }),
    z.object({
      success: z.literal(true),
      data: z.array(learningInterventionSchema),
    }),
  );
}

export async function createLearningIntervention(input: {
  classroomId: string;
  classroomStudentId: string;
  topicId?: string;
  interventionType: "reteach" | "check_in" | "practice" | "family_follow_up";
  priority: "low" | "medium" | "high";
  title: string;
  notes?: string;
  dueAt?: string;
}) {
  return await parseResponse(
    await fetch("/api/learning/interventions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    z.object({
      success: z.literal(true),
      data: learningInterventionSchema,
    }),
  );
}

export async function updateLearningIntervention(input: {
  interventionId: string;
  status: "planned" | "in_progress" | "completed" | "dismissed";
  notes?: string;
  dueAt?: string;
}) {
  return await parseResponse(
    await fetch(`/api/learning/interventions/${input.interventionId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: input.status,
        notes: input.notes,
        dueAt: input.dueAt,
      }),
    }),
    z.object({
      success: z.literal(true),
      data: learningInterventionSchema,
    }),
  );
}

export async function uploadTopicMaterial(input: {
  topicId: string;
  file: File;
  title?: string;
  description?: string;
}) {
  const formData = new FormData();
  formData.append("file", input.file);
  if (input.title) formData.append("title", input.title);
  if (input.description) formData.append("description", input.description);

  return await parseResponse(
    await fetch(`/api/learning/topics/${input.topicId}/materials`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        material: topicMaterialSchema,
        analysis: z.record(z.string(), z.unknown()),
        groundingSummary: z.string(),
      }),
    }),
  );
}

export async function fetchTopicReadiness(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/readiness`, {
      credentials: "include",
    }),
    z.object({ success: z.literal(true), data: readinessSchema }),
  );
}

export async function updateTopicStatus(topicId: string, status: "draft" | "active" | "paused" | "archived") {
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/status`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        id: z.string(),
        status: z.string(),
      }),
    }),
  );
}

export async function fetchTopicReports(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/reports`, {
      credentials: "include",
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        reports: z.array(
          z.object({
            id: z.string(),
            sessionId: z.string().nullable(),
            masteryPercent: z.number(),
            sourceLocale: z.string().optional(),
            createdAt: z.union([z.string(), z.date()]),
            updatedAt: z.union([z.string(), z.date()]),
            student: z.object({
              id: z.string(),
              fullName: z.string(),
              email: z.string().email(),
            }),
            report: teacherProgressReportSchema,
          }),
        ),
        summary: z.object({
          reportCount: z.number(),
          studentCount: z.number(),
          averageMasteryPercent: z.number().nullable(),
          averageConfidenceScore: z.number().nullable(),
          averageSessionDurationMinutes: z.number().nullable(),
          studentsNeedingAttention: z.number(),
          studentsStrongMastery: z.number(),
          studentsDeveloping: z.number(),
          studentsWithLowConfidence: z.number(),
          latestReportAt: z.string().nullable(),
          commonGaps: z.array(z.string()),
          commonRiskFlags: z.array(z.string()),
          recommendedTeacherFocus: z.array(z.string()),
        }),
      }),
    }),
  );
}

export async function fetchTopicQuestions(topicId: string, studentId?: string) {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/questions${query}`, {
      credentials: "include",
    }),
    z.object({
      success: z.literal(true),
      data: z.array(
        z.object({
          id: z.string(),
          createdAt: z.union([z.string(), z.date()]),
          role: z.string(),
          interactionType: z.string(),
          content: z.string(),
          metadata: z.record(z.string(), z.unknown()).nullable(),
          student: z.object({
            id: z.string(),
            fullName: z.string(),
            email: z.string().email(),
          }),
        }),
      ),
    }),
  );
}

export async function fetchStudentPatterns(studentId: string) {
  return await parseResponse(
    await fetch(`/api/learning/students/${studentId}/patterns`, {
      credentials: "include",
    }),
    teacherPatternResponseSchema,
  );
}

export async function fetchStudentOverview(studentId: string) {
  return await parseResponse(
    await fetch(`/api/learning/students/${studentId}/overview`, {
      credentials: "include",
    }),
    studentOverviewSchema,
  );
}

export async function fetchMyPatterns() {
  return await parseResponse(
    await fetch("/api/learning/me/patterns", { credentials: "include" }),
    studentPatternResponseSchema,
  );
}

export async function fetchTopicOverview(topicId: string) {
  return await parseResponse(
    await fetch(`/api/learning/topics/${topicId}/overview`, {
      credentials: "include",
    }),
    topicOverviewSchema,
  );
}

export async function fetchOnboardingState() {
  return await parseResponse(
    await fetch("/api/learning/onboarding", { credentials: "include" }),
    onboardingStateSchema,
  );
}

export async function fetchTutoringSession(
  topicId: string,
  language?: (typeof appLocales)[number],
) {
  const searchParams = new URLSearchParams();
  if (language) {
    searchParams.set("language", language);
  }

  return await parseResponse(
    await fetch(
      `/api/learning/topics/${topicId}/chat${searchParams.size ? `?${searchParams.toString()}` : ""}`,
      {
      credentials: "include",
      },
    ),
    z.object({ success: z.literal(true), data: tutoringSessionSchema }),
  );
}

export async function askOutOfSessionQuestion(input: {
  topicId: string;
  message: string;
  language?: (typeof appLocales)[number];
}) {
  return await parseResponse(
    await fetch(`/api/learning/topics/${input.topicId}/questions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        language: input.language,
      }),
    }),
    z.object({
      success: z.literal(true),
      data: z.object({
        classification: z.enum(["on_topic", "near_topic", "off_topic"]),
        response: z.string(),
      }),
    }),
  );
}

export async function validateStudentActivationToken(token: string) {
  return await parseResponse(
    await fetch(`/api/learning/student-access/activate?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    }),
    activationValidationSchema,
  );
}

export async function activateStudentAccount(input: {
  token: string;
  password: string;
  fullName: string;
}) {
  return await parseResponse(
    await fetch("/api/learning/student-access/activate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    z.object({
      success: z.literal(true),
      userId: z.string(),
      classroomStudentId: z.string(),
    }),
  );
}
