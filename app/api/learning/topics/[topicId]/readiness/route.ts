import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { apiError, apiUnhandledError } from "@/lib/api/error-contract";
import { z } from "zod";

import { analysisModel } from "@/lib/ai";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getTeacherTopicAccess } from "@/lib/learning/access";
import { getTopicWithMaterials } from "@/lib/learning/storage";

const readinessSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  clarifyingQuestions: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { topicId } = await params;
    const access = await getTeacherTopicAccess(session.user.id, topicId);

    if (!access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const topic = await getTopicWithMaterials(topicId);
    if (!topic) {
      return apiError("NOT_FOUND", "Topic not found");
    }

    const materialAnalyses = topic.materials.map((material) => ({
      title: material.title,
      analysis: material.analysis ?? {},
      extractedTextSample: material.extractedText?.slice(0, 4000) ?? "",
    }));

    const { output } = await generateText({
      model: analysisModel,
      output: Output.object({
        schema: readinessSchema,
      }),
      prompt: `You are helping a teacher decide whether a topic is ready for a grounded AI tutor.

Topic: ${topic.title}
Description: ${topic.description ?? ""}
Learning outcomes:
${topic.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Uploaded materials and analyses:
${JSON.stringify(materialAnalyses)}

Rules:
- Mark ready true only if the materials appear sufficient to support the outcomes without large factual gaps.
- Ask clarifying questions only when they are genuinely needed.
- Gaps should focus on missing source material, vague outcomes, or unsupported expectations.`,
    });

    return NextResponse.json({
      success: true,
      data: output,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to evaluate topic readiness", "/api/learning/topics/[topicId]/readiness");
  }
}
