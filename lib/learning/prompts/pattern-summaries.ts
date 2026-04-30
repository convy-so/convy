import type { StudentLearningPatternProfile } from "@/lib/learning/pattern-types";

export function buildPatternSummaryRewritePrompt(input: {
  profile: StudentLearningPatternProfile;
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
