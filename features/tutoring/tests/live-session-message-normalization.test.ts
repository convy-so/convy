import assert from "node:assert/strict";

import {
  hasSuccessfulFinishSession,
  normalizeLiveMessage,
} from "@/app/[locale]/student/classes/[classroomId]/lessons/live-session-message-parts";

function run() {
  const message = normalizeLiveMessage({
    id: "assistant_1",
    role: "assistant",
    parts: [
      { type: "text", text: "Let's check your answer." },
      {
        type: "dynamic-tool",
        toolName: "grade_student_work",
        toolCallId: "tool_1",
        state: "output-available",
        input: { conceptKey: "fractions" },
        output: { score: 0.8, feedback: "Good correction." },
      },
    ],
    annotations: [{ type: "metadata", data: { surface: "live-session" } }],
  });

  assert.equal(message.parts[0]?.kind, "text");
  assert.equal(message.parts[1]?.kind, "tool");
  assert.equal(message.metadata.surface, "live-session");

  const completed = normalizeLiveMessage({
    id: "assistant_2",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "finish_session",
        toolCallId: "tool_2",
        state: "output-available",
        input: {},
        output: { success: true, message: "Session marked complete." },
      },
    ],
  });

  assert.equal(hasSuccessfulFinishSession([message]), false);
  assert.equal(hasSuccessfulFinishSession([message, completed]), true);

  console.log("live-session message normalization tests passed");
}

run();
