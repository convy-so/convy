import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { classroomStudents, learningTopics } from "@/db/schema";
import { listActiveExpertGuidance, renderExpertGuidanceContext } from "@/lib/ai/guidance";
import { getVerifiedSession } from "@/lib/auth/session";
import { assertAiOpsUser } from "@/lib/auth/expert";
import { previewAssessmentQuestionForTopic } from "@/lib/learning/session-engine";
import { assessmentQuestionTypeSchema } from "@/lib/learning/subject-packages";
import { getTeachingContext } from "@/lib/teaching-context";

const previewSchema = z.object({
  topicId: z.string().min(1),
  classroomStudentId: z.string().optional(),
  conceptTitle: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  questionType: assessmentQuestionTypeSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    await assertAiOpsUser(session.user);
    const context = await getTeachingContext();

    if (!context.organizationId) {
      return NextResponse.json({ error: "Workspace required" }, { status: 400 });
    }

    const body = previewSchema.parse(await request.json());
    const topic = await getDb().query.learningTopics.findFirst({
      where: eq(learningTopics.id, body.topicId),
      with: {
        classroom: true,
      },
    });

    if (!topic || topic.classroom.organizationId !== context.organizationId) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const studentSeat = body.classroomStudentId
      ? await getDb().query.classroomStudents.findFirst({
          where: eq(classroomStudents.id, body.classroomStudentId),
          with: {
            interestProfile: true,
          },
        })
      : null;
    if (body.classroomStudentId && (!studentSeat || studentSeat.classroomId !== topic.classroomId)) {
      return NextResponse.json(
        { error: "Student preview context does not belong to this topic's classroom" },
        { status: 400 },
      );
    }

    const guidance = await listActiveExpertGuidance({
      feature: "tutoring_chat",
      artifactTypes: [
        "question_pattern",
        "rubric_set",
        "hint_ladder",
        "reflection_template",
        "subject_playbook",
      ],
      selectors: {
        organizationId: topic.classroom.organizationId,
        classroomId: topic.classroomId,
        topicId: topic.id,
        subjectKey: topic.subjectKey,
        gradeBand: topic.classroom.gradeBand,
        language: topic.contentLocale,
      },
    });

    const question = await previewAssessmentQuestionForTopic({
      topic,
      studentProfile: studentSeat?.interestProfile?.profile ?? null,
      conceptTitle: body.conceptTitle,
      difficulty: body.difficulty,
      questionType: body.questionType,
      runtimeContext: {
        expertGuidance: renderExpertGuidanceContext(guidance),
        metadata: {
          studyLanguage: topic.contentLocale,
          sourceContentLanguage: topic.contentLocale,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        question,
        guidanceCount: guidance.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message ?? "Validation error" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to preview question" },
      { status: 400 },
    );
  }
}
