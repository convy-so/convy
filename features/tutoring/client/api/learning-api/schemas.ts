import { z } from "zod";

import {
  learningSessionStateSchema,
  teacherProgressReportSchema,
} from "@/features/tutoring/public-server";
import { appLocales } from "@/shared/i18n/config";

const classroomSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
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
export type ClassroomStudent = z.infer<typeof classroomStudentSchema>;

const pendingInvitationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  expiresAt: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;

const topicSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    courseId: z.string().optional(),
    courseTitle: z.string().optional(),
    contentLocale: z.enum(appLocales).optional(),
    status: z.string(),
  })
  .passthrough();
export type Topic = z.infer<typeof topicSchema>;

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

const topicMaterialUploadAttemptSchema = z.object({
  id: z.string(),
  previousAttemptId: z.string().nullable().optional(),
  batchId: z.string(),
  topicId: z.string(),
  uploadedByUserId: z.string(),
  fileName: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  storageBucket: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  status: z.enum(["queued", "processing", "succeeded", "failed"]),
  stage: z.enum(["upload", "extraction", "analysis", "indexing", "pack_build"]),
  userMessage: z.string().nullable().optional(),
  retryable: z.boolean().nullable().optional(),
  queuedAt: z.union([z.string(), z.date()]).nullable().optional(),
  processingStartedAt: z.union([z.string(), z.date()]).nullable().optional(),
  failedAt: z.union([z.string(), z.date()]).nullable().optional(),
  completedAt: z.union([z.string(), z.date()]).nullable().optional(),
  failureMessage: z.string().nullable().optional(),
  internalError: z.string().nullable().optional(),
  materialId: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type TopicMaterialUploadAttempt = z.infer<
  typeof topicMaterialUploadAttemptSchema
>;

const activationStateSchema = z.object({
  ready: z.boolean(),
  reason: z.string(),
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
      description: z.string().nullable().optional(),
      courseId: z.string().optional(),
      courseTitle: z.string().optional(),
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
      latestActivityAt: z.string().nullable(),
      responseStatus: z.enum(["not_started", "in_progress", "completed"]),
      completedAt: z.string().nullable(),
    }),
  ),
});

const classroomInvitationSchema = z.object({
  id: z.string(),
  classroomId: z.string(),
  classroomTitle: z.string(),
  invitedEmail: z.string().email(),
  status: z.string(),
  expiresAt: z.string().nullable(),
});

export const learningMeSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("student"),
    student: z.array(learningStudentMembershipSchema),
    invitations: z.array(classroomInvitationSchema).default([]),
  }),
  z.object({
    role: z.literal("non-student"),
    student: z.null(),
    invitations: z.array(classroomInvitationSchema).default([]),
  }),
]);
export type LearningMeData = z.infer<typeof learningMeSchema>;

const onboardingMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
});

export const onboardingStateSchema = z.discriminatedUnion("completed", [
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
export type OnboardingStateResponse = z.infer<typeof onboardingStateSchema>;

const tutoringSessionSchema = z.object({
  sessionId: z.string(),
  sessionStatus: z.string().optional(),
  sessionLocale: z.enum(appLocales).optional(),
  sourceLocale: z.enum(appLocales).optional(),
  lesson: z.object({
    id: z.string(),
    title: z.string(),
    courseId: z.string().optional(),
    courseTitle: z.string().optional(),
  }),
  sessionState: learningSessionStateSchema,
  messages: z.array(onboardingMessageSchema),
});
export type TutoringSessionResponse = z.infer<typeof tutoringSessionSchema>;

const patternSchema = z.object({
  scopeType: z.string(),
  subjectKey: z.string().nullable().default(null),
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

const patternMemoryStateSchema = z.object({
  status: z.enum(["ready", "degraded", "unavailable"]),
  message: z.string().nullable(),
});

export const teacherPatternResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    student: z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.string().email(),
    }),
    profiles: z.array(patternSchema),
    memoryState: patternMemoryStateSchema,
  }),
});
export type TeacherPatternResponse = z.infer<typeof teacherPatternResponseSchema>;

const classroomStudentPatternResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    profiles: z.array(patternSchema),
    memoryState: patternMemoryStateSchema,
  }),
});
export type ClassroomStudentPatternResponse = z.infer<
  typeof classroomStudentPatternResponseSchema
>;

export const classroomStudentOverviewSchema = z.object({
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
    tutoringSessions: z.array(
      z.object({
        id: z.string(),
        topicId: z.string().nullable(),
        topicTitle: z.string().nullable(),
        sessionStatus: z.string(),
        sessionLocale: z.string(),
        summary: z.string().nullable(),
        createdAt: z.union([z.string(), z.date()]),
        updatedAt: z.union([z.string(), z.date()]),
        completedAt: z.union([z.string(), z.date()]).nullable(),
      }),
    ),
    conversationTurns: z.array(
      z.object({
        id: z.string(),
        topicId: z.string().nullable(),
        topicTitle: z.string().nullable(),
        sessionId: z.string(),
        interactionType: z.string(),
        role: z.string(),
        content: z.string(),
        createdAt: z.union([z.string(), z.date()]),
      }),
    ),
    navigation: z.object({
      previousStudent: z.object({ id: z.string(), fullName: z.string() }).nullable(),
      nextStudent: z.object({ id: z.string(), fullName: z.string() }).nullable(),
      position: z.number(),
      totalStudents: z.number(),
    }),
  }),
});
export type ClassroomStudentOverviewResponse = z.infer<
  typeof classroomStudentOverviewSchema
>;

export const topicOverviewSchema = z.object({
  success: z.literal(true),
  data: z.object({
    topic: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      courseId: z.string(),
      courseTitle: z.string(),
      contentLocale: z.enum(appLocales).optional(),
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
export type TopicOverviewResponse = z.infer<typeof topicOverviewSchema>;

const activationValidationSchema = z.object({
  valid: z.boolean(),
  student: z.object({ fullName: z.string(), email: z.string().email() }).optional(),
  classroom: z.object({ id: z.string(), title: z.string() }).optional(),
  expiresAt: z.string().optional(),
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
  interventionType: z.enum(["reteach", "check_in", "practice", "family_follow_up"]),
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
export type LearningIntervention = z.infer<typeof learningInterventionSchema>;

export const teacherClassroomsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(classroomSchema),
});

export const classroomStudentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    students: z.array(classroomStudentSchema),
    pendingInvitations: z.array(pendingInvitationSchema),
  }),
});

export const classroomTopicsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(topicSchema),
});

export const topicMaterialsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(topicMaterialSchema),
});

export const topicMaterialUploadAttemptsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(topicMaterialUploadAttemptSchema),
});

export const retryTopicMaterialUploadAttemptResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    attempt: topicMaterialUploadAttemptSchema,
  }),
});

export const classroomAssignedSurveysResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(classroomAssignedSurveyProgressSchema),
});

export const learningInterventionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(learningInterventionSchema),
});

export const uploadTopicMaterialResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    batchId: z.string(),
    attempts: z.array(topicMaterialUploadAttemptSchema),
  }),
});

export const topicActivationStateResponseSchema = z.object({
  success: z.literal(true),
  data: activationStateSchema,
});

export const topicReportsResponseSchema = z.object({
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
});

export const topicQuestionsResponseSchema = z.object({
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
});

export const tutoringSessionResponseSchema = z.object({
  success: z.literal(true),
  data: tutoringSessionSchema,
});

export const activateStudentAccountResponseSchema = z.object({
  success: z.literal(true),
  userId: z.string(),
  classroomStudentId: z.string(),
});

export {
  activationValidationSchema,
  classroomStudentPatternResponseSchema,
};
