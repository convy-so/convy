import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/error-contract";

import { getDb } from "@/db";
import { learningInteractions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getStudentTutoringAccess, getTeacherTopicAccess } from "@/lib/learning/access";
import {
  classifyOutOfSessionQuestion,
  generateOutOfSessionReply,
} from "@/lib/learning/out-of-session";
import { findLearningEvidenceContext } from "@/lib/learning/evidence";
import { logLearningInteraction } from "@/lib/learning/storage";
import type { GradeBand } from "@/lib/learning/types";
import { normalizeAppLocale } from "@/lib/i18n/config";
import { handleLearningRouteError } from "@/lib/learning/route-errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const topic = await getTeacherTopicAccess(session.user.id, topicId);

    if (!topic) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const url = new URL(request.url);
    const studentId = url.searchParams.get("studentId");

    const interactions = await getDb().query.learningInteractions.findMany({
      where: studentId
        ? and(
            eq(learningInteractions.topicId, topicId),
            isNull(learningInteractions.sessionId),
            eq(learningInteractions.classroomStudentId, studentId),
          )
        : and(
            eq(learningInteractions.topicId, topicId),
            isNull(learningInteractions.sessionId),
          ),
      with: {
        classroomStudent: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 100,
    });

    return NextResponse.json({
      success: true,
      data: interactions.map((interaction) => ({
        id: interaction.id,
        createdAt: interaction.createdAt,
        role: interaction.role,
        interactionType: interaction.interactionType,
        content: interaction.content,
        metadata: interaction.metadata,
        student: {
          id: interaction.classroomStudent.id,
          fullName: interaction.classroomStudent.fullName,
          email: interaction.classroomStudent.email,
        },
      })),
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to load questions",
      "/api/learning/topics/[topicId]/questions:get",
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const access = await getStudentTutoringAccess(session.user.id, topicId);
    const body = (await request.json()) as { message?: string; language?: string };

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    if (!body.message?.trim()) {
      return apiError("VALIDATION_ERROR", "Message is required");
    }

    const classification = await classifyOutOfSessionQuestion({
      topicTitle: access.topic.title,
      topicDescription: access.topic.description,
      learningOutcomes: access.topic.learningOutcomes,
      question: body.message.trim(),
    });

    const retrieved = await findLearningEvidenceContext({
      topicId,
      query: body.message.trim(),
      language: normalizeAppLocale(access.topic.contentLocale),
      limit: 6,
    });

    const response = await generateOutOfSessionReply({
      classification: classification.classification,
      topicTitle: access.topic.title,
      learningOutcomes: access.topic.learningOutcomes,
      gradeBand: access.topic.classroom.gradeBand as GradeBand,
      studentProfile: access.classroomStudent.interestProfile.profile,
      question: body.message.trim(),
      retrievedContext: retrieved.map((item) => item.content),
      language: normalizeAppLocale(body.language ?? access.topic.contentLocale),
    });

    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId,
      role: "user",
      interactionType: "out_of_session_question",
      content: body.message.trim(),
      metadata: {
        relevance: classification.classification,
        rationale: classification.rationale,
      },
    });

    await logLearningInteraction({
      classroomStudentId: access.classroomStudent.id,
      topicId,
      role: "assistant",
      interactionType: "agent_answer",
      content: response,
      metadata: {
        relevance: classification.classification,
        retrievedContextCount: retrieved.length,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        classification: classification.classification,
        response,
      },
    });
  } catch (error) {
    return handleLearningRouteError(
      error,
      "Failed to answer out-of-session question",
      "/api/learning/topics/[topicId]/questions:post",
    );
  }
}
