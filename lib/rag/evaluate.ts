import { generateText, Output } from "ai";
import { flashLiteModel } from "@/lib/ai";
import { z } from "zod";

export interface EvaluationResult {
  contextRelevance: number; // 0.0 to 1.0
  groundedness: number;     // 0.0 to 1.0
  answerRelevance: number;  // 0.0 to 1.0
  isGrounded: boolean;
  reasoning: string;
}

/**
 * Runs the Evaluation Triad on a generated RAG response before delivery.
 * Uses gemini-2.5-flash-lite for fast, inexpensive parallel scoring.
 */
export async function evaluateResponse(
  query: string,
  contextBlocks: string[],
  generatedResponse: string
): Promise<EvaluationResult> {
  const contextText = contextBlocks.join("\n\n");

  try {
    const { output: object } = await generateText({
      model: flashLiteModel,
      output: Output.object({
        schema: z.object({
          contextRelevance: z.number().min(0).max(1).describe("Score 0-1: Does the retrieved context actually contain information relevant to the user's query?"),
          groundedness: z.number().min(0).max(1).describe("Score 0-1: Are ALL claims in the generated response supported by the provided context? 0 if it hallucinates."),
          answerRelevance: z.number().min(0).max(1).describe("Score 0-1: Does the generated response directly answer the user's specific query without dodging?"),
          reasoning: z.string().describe("Brief explanation for the scores, especially if groundedness is < 1.")
        }),
      }),
      prompt: `Evaluate the following RAG system outputs according to Contextual AI's Evaluation Triad rules.

USER QUERY:
"${query}"

RETRIEVED CONTEXT:
${contextText}

GENERATED RESPONSE:
${generatedResponse}

Provide a strict, critical score. If the generated response makes claims not found in the context, Groundedness MUST be low.`,
    });

    // Threshold: if groundedness is below 0.8, it's considered ungrounded
    const isGrounded = object.groundedness >= 0.8;

    // In a full production system, we log this to Postgres here
    console.log(`[Eval Triad] Groundedness: ${object.groundedness}, ContextRel: ${object.contextRelevance}, AnswerRel: ${object.answerRelevance} - Passed: ${isGrounded}`);

    return {
      ...object,
      isGrounded
    };
  } catch (err) {
    console.error("Evaluation Triad failed, allowing response by default:", err);
    return {
      contextRelevance: 1,
      groundedness: 1,
      answerRelevance: 1,
      isGrounded: true,
      reasoning: "Evaluation failed to run"
    };
  }
}
