import { appLocales } from "@/shared/i18n/config";

import { parseResponse } from "./core";
import {
  classroomStudentPatternResponseSchema,
  studentMeSchema,
  onboardingStateSchema,
  tutoringSessionResponseSchema,
} from "./schemas";

export async function fetchStudentMe() {
  return await parseResponse(
    await fetch("/api/students/me", { credentials: "include" }),
    studentMeSchema,
  );
}

export async function fetchMyPatterns() {
  return await parseResponse(
    await fetch("/api/students/me/patterns", { credentials: "include" }),
    classroomStudentPatternResponseSchema,
  );
}

export async function fetchOnboardingState() {
  return await parseResponse(
    await fetch("/api/students/onboarding", { credentials: "include" }),
    onboardingStateSchema,
  );
}

export async function fetchTutoringSession(
  lessonId: string,
  language?: (typeof appLocales)[number],
) {
  const searchParams = new URLSearchParams();
  if (language) {
    searchParams.set("language", language);
  }

  return await parseResponse(
    await fetch(
      `/api/lessons/${lessonId}/tutoring-session${searchParams.size ? `?${searchParams.toString()}` : ""}`,
      {
        credentials: "include",
      },
    ),
    tutoringSessionResponseSchema,
  );
}
