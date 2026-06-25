import assert from "node:assert/strict";

import { createTutorTools } from "@/features/tutoring/server/agent-tools";
import type { ExpertFrameworkCapabilityGuidance } from "@/features/tutoring/public-server";
import {
  configureMediaRetrievalTestHooks,
  executeImageSearchPipeline,
  executeVideoSearchPipeline,
  resetMediaRetrievalTestHooks,
} from "@/features/tutoring/server/media-retrieval";
import type { MediaToolResult } from "@/features/tutoring/server/media-retrieval/media-retrieval-contract";

function requireTool<T>(value: T | undefined, message: string): T {
  assert.ok(value, message);
  return value;
}

function expectMediaFailure(
  result: MediaToolResult,
): Exclude<MediaToolResult, { success: true }> {
  assert.equal(result.success, false);
  return result;
}

function createCapabilityGuidance(
  overrides?: Partial<ExpertFrameworkCapabilityGuidance>,
): ExpertFrameworkCapabilityGuidance {
  return {
    search_image: {
      enabled: true,
      policy: "Use only when a grounded visual will materially help.",
      maxUsesPerTurn: 5,
      ...(overrides?.search_image ?? {}),
    },
    search_video: {
      enabled: true,
      policy: "Use only when motion or sequence is necessary.",
      maxUsesPerTurn: 2,
      ...(overrides?.search_video ?? {}),
    },
    administer_quiz: {
      enabled: true,
      policy: "Use a quiz card only for a focused formal check.",
      ...(overrides?.administer_quiz ?? {}),
    },
    grade_student_work: {
      enabled: true,
      policy: "Grade only a submitted quiz answer tied to a quizId.",
      ...(overrides?.grade_student_work ?? {}),
    },
    finish_session: {
      policy: "Finish only with concrete evidence and a next step.",
      ...(overrides?.finish_session ?? {}),
    },
  };
}

async function run() {
  const previousTavilyKey = process.env.TAVILY_API_KEY;
  const previousYoutubeKey = process.env.YOUTUBE_DATA_API_KEY;

  delete process.env.TAVILY_API_KEY;
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

    process.env.TAVILY_API_KEY = "test-tavily-key";
    process.env.YOUTUBE_DATA_API_KEY = "test-youtube-key";

    configureMediaRetrievalTestHooks({
      tavilySearch: () => Promise.resolve({
        images: [
          {
            url: "https://cdn.example.edu/media/mitosis-labeled-diagram.png",
            description: "Mitosis labeled diagram",
          },
          {
            url: "https://images.example.org/media/mitosis-photo.jpg",
            description: "Microscope photo of mitosis",
          },
        ],
        results: [
          {
            title: "Mitosis study guide",
            url: "https://example.edu/biology/mitosis-guide",
            content: "This page explains mitosis with a labeled diagram and study notes.",
            images: [
              {
                url: "https://cdn.example.edu/media/mitosis-labeled-diagram.png",
                description: "Mitosis labeled diagram",
              },
            ],
          },
          {
            title: "Cell division image bank",
            url: "https://example.org/gallery/mitosis",
            content: "A gallery of cell division microscope photos.",
            images: [
              {
                url: "https://images.example.org/media/mitosis-photo.jpg",
                description: "Microscope photo of mitosis",
              },
            ],
          },
        ],
      }),
      youtubeFetch: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: "video123" },
                snippet: {
                  title: "Mitosis explained clearly",
                  description: "A concise mitosis animation for students.",
                  channelTitle: "Khan Academy",
                  publishedAt: "2024-01-15T00:00:00Z",
                },
              },
              {
                id: { videoId: "video456" },
                snippet: {
                  title: "Cell cycle overview",
                  description: "A broader look at the cell cycle.",
                  channelTitle: "Science Channel",
                  publishedAt: "2023-03-10T00:00:00Z",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )),
      generateStructuredOutput: ({ prompt }) => {
        if (prompt.includes("candidate images returned by a search")) {
          return Promise.resolve({ index: 0, reason: "The labeled diagram is the clearest educational visual." });
        }

        if (prompt.includes("candidate videos")) {
          return Promise.resolve({ index: 0, reason: "The first video is the most focused educational explainer." });
        }

        return Promise.reject(new Error("Unexpected structured output prompt"));
      },
    });

    const imageSuccess = await executeImageSearchPipeline(
      "mitosis labeled diagram",
      "diagram",
      "Mitosis",
      "Student needs a clear visual.",
    );
    assert.equal(imageSuccess.success, true, "expected image pipeline to return a successful result");
    if (imageSuccess.success) {
      assert.equal(imageSuccess.mediaType, "image");
      assert.equal(imageSuccess.provider, "tavily");
      assert.equal(imageSuccess.url, "https://cdn.example.edu/media/mitosis-labeled-diagram.png");
      assert.equal(imageSuccess.sourceUrl, "https://example.edu/biology/mitosis-guide");
      assert.equal(imageSuccess.title, "Mitosis labeled diagram");
    }

    const videoSuccess = await executeVideoSearchPipeline(
      "how mitosis works explained",
      "Mitosis",
      "Student needs a process explanation.",
    );
    assert.equal(videoSuccess.success, true, "expected video pipeline to return a successful result");
    if (videoSuccess.success) {
      assert.equal(videoSuccess.mediaType, "video");
      assert.equal(videoSuccess.provider, "youtube");
      assert.equal(videoSuccess.watchUrl, "https://www.youtube.com/watch?v=video123");
      assert.equal(videoSuccess.url, "https://www.youtube.com/embed/video123");
      assert.equal(videoSuccess.title, "Mitosis explained clearly");
    }

    const tools = createTutorTools({
      topicTitle: "Cell Biology",
      studentContext: "Prefers concrete visuals.",
      capabilityGuidance: createCapabilityGuidance(),
      priorQuizIds: ["quiz_123"],
    });

    assert.equal("search_image" in tools, true);
    assert.equal("search_video" in tools, true);
    assert.equal("administer_quiz" in tools, true);
    assert.equal("grade_student_work" in tools, true);
    assert.equal("finish_session" in tools, true);

    assert.ok(
      tools.search_image?.description.includes("Framework policy (authoritative"),
      "expected enabled tool descriptions to include framework-authored policy",
    );

    const searchImageTool = requireTool(
      tools.search_image,
      "expected search_image tool to be available",
    );
    const searchVideoTool = requireTool(
      tools.search_video,
      "expected search_video tool to be available",
    );
    const gradeStudentWorkTool = requireTool(
      tools.grade_student_work,
      "expected grade_student_work tool to be available",
    );

    const firstImageCall = await searchImageTool.execute({
      query: "mitosis labeled diagram",
      image_type: "diagram",
    });
    assert.equal(firstImageCall.success, true, "expected first image call to return a successful image result");

    for (let callIndex = 0; callIndex < 4; callIndex += 1) {
      const imageCall = await searchImageTool.execute({
        query: `mitosis labeled diagram variation ${callIndex + 2}`,
        image_type: "diagram",
      });
      assert.equal(imageCall.success, true, "expected image search to remain available until the sixth call");
    }

    const sixthImageCall = await searchImageTool.execute({
      query: "mitosis labeled diagram variation 6",
      image_type: "diagram",
    });
    assert.equal(
      expectMediaFailure(sixthImageCall).errorCode,
      "duplicate_call_blocked",
    );

    const firstVideoCall = await searchVideoTool.execute({
      query: "mitosis explained animation",
    });
    assert.equal(firstVideoCall.success, true, "expected first video call to return a successful video result");

    const secondVideoCall = await searchVideoTool.execute({
      query: "cell cycle explained animation",
    });
    assert.equal(secondVideoCall.success, true, "expected second video call to remain available");

    const thirdVideoCall = await searchVideoTool.execute({
      query: "chromosome replication explained animation",
    });
    assert.equal(
      expectMediaFailure(thirdVideoCall).errorCode,
      "duplicate_call_blocked",
    );

    const parsedGradeInput = gradeStudentWorkTool.inputSchema.parse({
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
      capabilityGuidance: createCapabilityGuidance({
        search_image: { enabled: false, policy: "", maxUsesPerTurn: 2 },
        search_video: { enabled: false, policy: "", maxUsesPerTurn: 1 },
      }),
      priorQuizIds: [],
    });
    assert.equal("search_image" in missingQuizContextTools, false);
    assert.equal("search_video" in missingQuizContextTools, false);
    assert.equal("finish_session" in missingQuizContextTools, true);

    const missingQuizGrade = await requireTool(
      missingQuizContextTools.grade_student_work,
      "expected grade_student_work tool to remain available",
    ).execute({
      quizId: "quiz_missing",
      conceptKey: "mitosis",
      studentAnswerSummary: "Student answered without a prior quiz context.",
      score: 50,
      feedback: "Review the quiz context first.",
      masteryLevel: "surface",
    });
    assert.equal(missingQuizGrade.success, false);

    const limitedMediaTools = createTutorTools({
      topicTitle: "Cell Biology",
      studentContext: "Prefers concrete visuals.",
      capabilityGuidance: createCapabilityGuidance({
        search_image: {
          enabled: true,
          policy: "Use only when a single diagram clarifies the student error.",
          maxUsesPerTurn: 1,
        },
        search_video: {
          enabled: true,
          policy: "Use only when motion matters.",
          maxUsesPerTurn: 1,
        },
      }),
      priorQuizIds: ["quiz_123"],
    });

    const limitedSearchImageTool = requireTool(
      limitedMediaTools.search_image,
      "expected limited search_image tool to be available",
    );
    const limitedImageCall = await limitedSearchImageTool.execute({
      query: "mitosis labeled diagram",
      image_type: "diagram",
    });
    assert.equal(limitedImageCall.success, true);
    const blockedLimitedImageCall = await limitedSearchImageTool.execute({
      query: "second mitosis labeled diagram",
      image_type: "diagram",
    });
    assert.equal(blockedLimitedImageCall.success, false);

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
    resetMediaRetrievalTestHooks();

    if (typeof previousTavilyKey === "string") {
      process.env.TAVILY_API_KEY = previousTavilyKey;
    } else {
      delete process.env.TAVILY_API_KEY;
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
