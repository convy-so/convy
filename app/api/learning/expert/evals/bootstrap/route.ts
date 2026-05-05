import { NextResponse } from "next/server";
import { apiUnhandledError } from "@/lib/api/error-contract";

import { getVerifiedSession } from "@/lib/auth/session";
import { isExpertRole } from "@/lib/auth/roles";

const tutoringEvalFamilies = [
  {
    key: "knowledge_accuracy",
    title: "Knowledge Accuracy",
    description:
      "Checks that tutoring stays faithful to uploaded course materials and does not introduce off-scope concepts.",
  },
  {
    key: "pedagogical_behavior",
    title: "Pedagogical Behavior",
    description:
      "Checks that published crystallized heuristics are applied in the intended situations.",
  },
  {
    key: "depth_probing",
    title: "Depth-Probing",
    description:
      "Checks that shallow-but-technically-correct student responses are challenged appropriately.",
  },
  {
    key: "regression",
    title: "Regression",
    description:
      "Runs the full suite whenever frameworks or published runtime models change.",
  },
];

export async function POST() {
  try {
    const session = await getVerifiedSession();
    if (!isExpertRole(session.user)) {
      throw new Error("Unauthorized: Expert or admin access required");
    }

    return NextResponse.json({
      success: true,
      data: tutoringEvalFamilies,
    });
  } catch (error) {
    return apiUnhandledError(error, "Failed to bootstrap tutoring eval families", "/api/learning/expert/evals/bootstrap");
  }
}
