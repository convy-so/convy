import assert from "node:assert/strict";

import { createTutorTools } from "@/lib/learning/agent-tools";
import {
  executeImageSearchPipeline,
  executeVideoSearchPipeline,
} from "@/lib/learning/media-retrieval";

async function run() {
  const previousBingKey = process.env.BING_IMAGE_SEARCH_API_KEY;
  const previousYoutubeKey = process.env.YOUTUBE_DATA_API_KEY;

  delete process.env.BING_IMAGE_SEARCH_API_KEY;
  delete process.env.YOUTUBE_DATA_API_KEY;

  try {
    const imageFailure = await executeImageSearchPipeline(
      "mitosis labeled diagram",
      "diagram",
      "Mitosis",
      "Student needs a clear visual.",
    );
    assert.equal(imageFailure.success, false, "expected image pipeline to fail cleanly without config");
    if (!imageFailure.success) {
      assert.equal(imageFailure.errorCode, "config_missing");
      assert.ok(
        imageFailure.retryHint.length > 0,
        "expected image failures to include a retry hint",
      );
      assert.equal(imageFailure.mediaType, "image");
    }

    const videoFailure = await executeVideoSearchPipeline(
      "how DNA replication works explained",
      "DNA replication",
      "Student needs a process explanation.",
    );
    assert.equal(videoFailure.success, false, "expected video pipeline to fail cleanly without config");
    if (!videoFailure.success) {
      assert.equal(videoFailure.errorCode, "config_missing");
      assert.ok(
        videoFailure.suggestedAction.length > 0,
        "expected video failures to include a suggested action",
      );
      assert.equal(videoFailure.mediaType, "video");
    }

    const tools = createTutorTools({
      topicTitle: "Cell Biology",
      studentContext: "Prefers concrete visuals.",
      priorQuizIds: ["quiz_123"],
      canFinishSession: true,
    });

    const firstImageCall = await tools.search_image.execute({
      query: "mitosis labeled diagram",
      image_type: "diagram",
    });
    assert.equal(firstImageCall.success, false, "expected first image call to fail without provider config");

    const secondImageCall = await tools.search_image.execute({
      query: "mitosis labeled diagram",
      image_type: "diagram",
    });
    assert.equal(secondImageCall.success, false);
    if (!secondImageCall.success) {
      assert.equal(secondImageCall.errorCode, "duplicate_call_blocked");
    }

    const parsedGradeInput = tools.grade_student_work.inputSchema.parse({
      quizId: "quiz_123",
      conceptKey: "mitosis",
      studentAnswerSummary: "Student identified prophase and metaphase correctly but missed telophase.",
      score: 74,
      feedback: "You identified the early stages correctly. Review what happens during telophase.",
      masteryLevel: "applied",
    });
    assert.equal(parsedGradeInput.quizId, "quiz_123");
    assert.equal(parsedGradeInput.conceptKey, "mitosis");

    const missingQuizContextTools = createTutorTools({
      topicTitle: "Cell Biology",
      studentContext: "Prefers concrete visuals.",
      priorQuizIds: [],
      canFinishSession: false,
    });
    const missingQuizGrade = await missingQuizContextTools.grade_student_work.execute({
      quizId: "quiz_missing",
      conceptKey: "mitosis",
      studentAnswerSummary: "Student answered without a prior quiz context.",
      score: 50,
      feedback: "Review the quiz context first.",
      masteryLevel: "surface",
    });
    assert.equal(missingQuizGrade.success, false);
    assert.equal("finish_session" in missingQuizContextTools, false);

    assert.equal("finish_session" in tools, true);
    if (!("finish_session" in tools)) {
      throw new Error("Expected finish_session tool to be available.");
    }

    const finishInput = tools.finish_session.inputSchema.parse({
      completionRationale: "Student explained the phases and corrected the earlier error.",
      coveredOutcomes: ["Identify mitosis phases"],
      evidenceSummary: "Quiz answer and follow-up explanation were accurate.",
      nextStepNote: "Review the diagram once more before the next lesson.",
    });
    assert.equal(finishInput.coveredOutcomes.length, 1);
    assert.throws(() =>
      tools.finish_session.inputSchema.parse({
        completionRationale: "",
        coveredOutcomes: [],
        evidenceSummary: "",
        nextStepNote: "",
      }),
    );
  } finally {
    if (typeof previousBingKey === "string") {
      process.env.BING_IMAGE_SEARCH_API_KEY = previousBingKey;
    } else {
      delete process.env.BING_IMAGE_SEARCH_API_KEY;
    }

    if (typeof previousYoutubeKey === "string") {
      process.env.YOUTUBE_DATA_API_KEY = previousYoutubeKey;
    } else {
      delete process.env.YOUTUBE_DATA_API_KEY;
    }
  }

  console.log("learning-agent-tools tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
