import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classroomStudents,
  expertFrameworks,
  learningInteractions,
  learningSessions,
  learningTopics,
} from "@/db/schema";

export async function getTeacherOwnedTopic(userId: string, topicId: string) {
  const topic = await getDb().query.learningTopics.findFirst({
    where: eq(learningTopics.id, topicId),
    with: {
      classroom: true,
    },
  });

  if (!topic) {
    return null;
  }

  return topic;
}

export async function getTeacherOwnedFramework(userId: string, frameworkId: string) {
  const framework = await getDb().query.expertFrameworks.findFirst({
    where: eq(expertFrameworks.id, frameworkId),
    with: {
      classroom: true,
      topic: {
        with: {
          classroom: true,
        },
      },
    },
  });

  if (!framework) {
    return null;
  }

  return framework;
}

export async function getTeacherOwnedClassroomStudent(
  userId: string,
  classroomStudentId: string,
) {
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

export async function getTeacherOwnedLearningSession(userId: string, sessionId: string) {
  const session = await getDb().query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
    with: {
      topic: {
        with: {
          classroom: true,
        },
      },
    },
  });

  if (!session || !session.topic) {
    return null;
  }

  return session;
}

export async function getTeacherOwnedLearningInteraction(
  userId: string,
  interactionId: string,
) {
  const interaction = await getDb().query.learningInteractions.findFirst({
    where: eq(learningInteractions.id, interactionId),
    with: {
      session: {
        with: {
          topic: {
            with: {
              classroom: true,
            },
          },
        },
      },
    },
  });

  if (!interaction || !interaction.session || !interaction.session.topic) {
    return null;
  }

  return interaction;
}

export async function resolveTeacherExpertAnchor(
  userId: string,
  params: {
    topicId?: string | null;
    classroomStudentId?: string | null;
    sessionId?: string | null;
    interactionId?: string | null;
  },
) {
  if (params.topicId) {
    const topic = await getTeacherOwnedTopic(userId, params.topicId);
    if (!topic) return null;
    return {
      topicId: topic.id,
      classroomStudentId: params.classroomStudentId ?? null,
      sessionId: params.sessionId ?? null,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.classroomStudentId) {
    const classroomStudent = await getTeacherOwnedClassroomStudent(
      userId,
      params.classroomStudentId,
    );
    if (!classroomStudent) return null;
    return {
      topicId: params.topicId ?? null,
      classroomStudentId: classroomStudent.id,
      sessionId: params.sessionId ?? null,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.sessionId) {
    const session = await getTeacherOwnedLearningSession(userId, params.sessionId);
    if (!session) return null;
    return {
      topicId: params.topicId ?? session.topicId ?? null,
      classroomStudentId: params.classroomStudentId ?? session.classroomStudentId ?? null,
      sessionId: session.id,
      interactionId: params.interactionId ?? null,
    };
  }

  if (params.interactionId) {
    const interaction = await getTeacherOwnedLearningInteraction(
      userId,
      params.interactionId,
    );
    if (!interaction) return null;
    return {
      topicId: params.topicId ?? interaction.session?.topicId ?? null,
      classroomStudentId:
        params.classroomStudentId ?? interaction.classroomStudentId ?? null,
      sessionId: params.sessionId ?? interaction.sessionId ?? null,
      interactionId: interaction.id,
    };
  }

  return null;
}
