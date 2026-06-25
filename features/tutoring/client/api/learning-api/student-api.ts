import { appLocales } from "@/shared/i18n/config";

import { parseResponse } from "./core";
import {
  activateStudentAccountResponseSchema,
  activationValidationSchema,
  classroomStudentPatternResponseSchema,
  learningMeSchema,
  onboardingStateSchema,
  tutoringSessionResponseSchema,
} from "./schemas";

export async function fetchLearningMe() {
  return await parseResponse(
    await fetch("/api/learning/me", { credentials: "include" }),
    learningMeSchema,
  );
}

export async function fetchMyPatterns() {
  return await parseResponse(
    await fetch("/api/learning/me/patterns", { credentials: "include" }),
    classroomStudentPatternResponseSchema,
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
      `/api/learning/lessons/${topicId}/tutoring-session${searchParams.size ? `?${searchParams.toString()}` : ""}`,
      {
        credentials: "include",
      },
    ),
    tutoringSessionResponseSchema,
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
    activateStudentAccountResponseSchema,
  );
}
