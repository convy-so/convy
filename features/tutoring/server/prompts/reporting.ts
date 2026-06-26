import {
  buildPromptFrame,
  renderInterestProfile,
  renderPreviousReport,
  renderReportState,
  renderTaggedSection,
  renderTranscript,
} from "@/features/tutoring/server/prompt-serializers";
import type {
  StudentSessionState,
  StudentInterestProfile,
  TeacherProgressReport,
} from "@/features/tutoring/public-server";

export function buildTeacherOnboardingSummaryPrompt(input: {
  studentName: string;
  profile: Partial<StudentInterestProfile> | StudentInterestProfile | null;
}) {
  const profileText = input.profile
    ? renderInterestProfile(input.profile)
    : "No onboarding profile.";

  return [
    buildPromptFrame({
      role: "Write a concise teacher-facing onboarding summary.",
      goal: `Summarize what Convy learned about ${input.studentName}'s motivation, confidence, and likely teaching entry points.`,
      constraints: [
        "Use only the supplied profile.",
        "Focus on signals a real teacher can act on quickly.",
      ],
      outputContract: ["Return a single concise summary field."],
    }),
    renderTaggedSection("student", input.studentName),
    renderTaggedSection("profile", profileText),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildReportingPrompt(input: {
  studentName: string;
  lessonTitle: string;
  sessionState: StudentSessionState;
  teachingPlaybook: Record<string, unknown> | null;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  previousReport: TeacherProgressReport | null;
}) {
  return [
    buildPromptFrame({
      role: "Generate a teacher-facing progress report for one tutoring session.",
      goal: `Explain ${input.studentName}'s progress in ${input.lessonTitle} using grounded session evidence.`,
      constraints: [
        "Ground claims in the extracted evidence, session state, and transcript.",
        "Be explicit about uncertainty when evidence is limited.",
        "Use the teaching playbook only as personalization context, not as fresh evidence.",
      ],
      antiRules: [
        "Do not claim progress that the transcript does not support.",
        "Do not treat memory or playbook notes as proof.",
      ],
      outputContract: [
        "Return the structured teacher progress report schema only.",
      ],
    }),
    renderTaggedSection("student", input.studentName),
    renderTaggedSection("lesson", input.lessonTitle),
    renderTaggedSection(
      "session_state",
      renderReportState(input.sessionState, input.teachingPlaybook),
    ),
    renderTaggedSection("previous_report", renderPreviousReport(input.previousReport)),
    renderTaggedSection("transcript", renderTranscript(input.transcript)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

