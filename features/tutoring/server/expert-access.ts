import { eq } from "drizzle-orm";

import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentInteractions,
  studentSessions,
  lessons,
} from "@/shared/db/schema";
import { getFrameworkRecord } from "@/features/tutoring/server/framework-records";

export async function getExpertAccessibleLesson(lessonId: string) {
  const lesson = await getDb().query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: {
      classroom: true,
    },
  });

  if (!lesson) {
    return null;
  }

  return lesson;
}

export async function getExpertAccessibleFramework(frameworkId: string) {
  const framework = await getFrameworkRecord(frameworkId);

  if (!framework) {
    return null;
  }

  return framework;
}

export async function getExpertAccessibleClassroomStudent(classroomStudentId: string) {
  const classroomStudent = await getDb().query.classroomStudents.findFirst({
    where: eq(classroomStudents.id, classroomStudentId),
    with: {
      classroom: true,
    },
  });

  if (!classroomStudent) {
    return null;
  }

  return classroomStudent;
}

export async function getExpertAccessibleLearningSession(sessionId: string) {
  const session = await getDb().query.studentSessions.findFirst({
    where: eq(studentSessions.id, sessionId),
    with: {
      lesson: {
        with: {
          classroom: true,
        },
      },
    },
  });

  if (!session || !session.lesson) {
    return null;
  }

  return session;
}

export async function getExpertAccessibleLearningInteraction(interactionId: string) {
  const interaction = await getDb().query.studentInteractions.findFirst({
    where: eq(studentInteractions.id, interactionId),
    with: {
      session: {
        with: {
          lesson: {
            with: {
              classroom: true,
            },
          },
        },
      },
    },
  });

  if (!interaction || !interaction.session || !interaction.session.lesson) {
    return null;
  }

  return interaction;
}

export async function resolveExpertReviewAnchor(params: {
  lessonId?: string | null;
  classroomStudentId?: string | null;
  sessionId?: string | null;
  interactionId?: string | null;
}) {
  if (params.lessonId) {
    const lesson = await getExpertAccessibleLesson(params.lessonId);
    if (!lesson) return null;
    return {
      lessonId: lesson.id,
      classroomStudentId: params.classroomStudentId ?? null,
      sessionId: params.sessionId ?? null,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.classroomStudentId) {
    const classroomStudent = await getExpertAccessibleClassroomStudent(
      params.classroomStudentId,
    );
    if (!classroomStudent) return null;
    return {
      lessonId: params.lessonId ?? null,
      classroomStudentId: classroomStudent.id,
      sessionId: params.sessionId ?? null,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.sessionId) {
    const session = await getExpertAccessibleLearningSession(params.sessionId);
    if (!session) return null;
    return {
      lessonId: params.lessonId ?? session.lessonId ?? null,
      classroomStudentId: params.classroomStudentId ?? session.classroomStudentId ?? null,
      sessionId: session.id,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.interactionId) {
    const interaction = await getExpertAccessibleLearningInteraction(
      params.interactionId,
    );
    if (!interaction) return null;
    return {
      lessonId: params.lessonId ?? interaction.session?.lessonId ?? null,
      classroomStudentId:
        params.classroomStudentId ?? interaction.classroomStudentId ?? null,
      sessionId: params.sessionId ?? interaction.sessionId ?? null,
      interactionId: interaction.id,
    };
  }

  return null;
}

