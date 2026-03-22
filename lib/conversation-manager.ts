import { tool, Output, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { ExpertStateStore } from "@/lib/expert-state-store";
import { domainBrain } from "@/lib/domain-brain";
import { type SurveyConfig } from "@/lib/prompts";
import { analysisModel } from "@/lib/ai";
import { getRedisClient } from "@/lib/redis";
import { logUsage } from "./billing/logger";
import { MemoryBridge, TranscriptTurn, DEFAULT_CONTEXT_BUDGET } from "@/lib/memory-bridge";
import { ExpertState } from "./schemas/expert-state";


export class ConversationManager {
  static normalizeMessages(
    messages: Array<any>,
    config?: SurveyConfig,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];

    messages.forEach((m) => {
      if (m.role !== "user" && m.role !== "assistant") return;

      let content = "";
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        content = m.content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n");
      }

      const invocations = m.toolCalls || m.toolInvocations;
      if (m.role === "assistant" && invocations && Array.isArray(invocations)) {
        const markers = invocations
          .map((inv: any) => {
            const toolName = inv.toolName;
            if (toolName === "showMedia") {
              const mediaId = inv.input?.mediaId || inv.args?.mediaId;
              const media = config?.media?.find((item) => item.id === mediaId);
              const label = media
                ? `${media.type} "${media.description}"`
                : `media ${mediaId}`;
              return `[ACTION: Displayed ${label}]`;
            }
            return `[ACTION: Called tool ${toolName}]`;
          })
          .join(" ");

        if (markers) {
          content = (markers + (content ? "\n" + content : "")).trim();
        }
      }

      normalized.push({
        role: m.role as "user" | "assistant",
        content:
          content ||
          (m.role === "assistant" ? "[AI Response]" : "[Empty Message]"),
      });
    });

    return normalized;
  }

  static async loadOrCreateMemoryBridge(
    sessionId: string
  ): Promise<MemoryBridge> {
    const redis = getRedisClient();
    const key = `session:memory_bridge:${sessionId}`;
    
    if (redis.status === "ready" || redis.status === "connect") {
      try {
        const serialized = await redis.get(key);
        if (serialized) {
          return MemoryBridge.fromRedis(serialized, DEFAULT_CONTEXT_BUDGET);
        }
      } catch (error) {
        console.warn(`[ConversationManager] Failed to load MemoryBridge for ${sessionId}`, error);
      }
    }
    
    return new MemoryBridge(DEFAULT_CONTEXT_BUDGET);
  }

  static async updateMemoryAsync(
    sessionId: string,
    config: SurveyConfig,
    expertState: ExpertState,
    memoryBridge: MemoryBridge,
    newTurn: TranscriptTurn,
    metadata?: { userId?: string; organizationId?: string }
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      const rawTurns = expertState.transcript.turns.filter((t: any) => t.type !== "summary_block") as TranscriptTurn[];

      // Only run LLM analysis when an exchange (agent + respondent) is complete.
      if (rawTurns.length >= 2 && newTurn.speaker === "agent") {
        let startIndex = rawTurns.length - 2;
        while (startIndex > 0 && rawTurns[startIndex - 1].speaker === "respondent") {
          startIndex--;
        }
        const lastExchange = rawTurns.slice(startIndex);
        const conversationText = lastExchange
          .map(m => `${m.speaker === "respondent" ? "Participant" : "Interviewer"}: ${m.text}`)
          .join("\n");

        const schema = z.object({
          nodesAddressed: z.array(z.object({
            nodeId: z.string().describe("The ID of the coverage node from the checklist."),
            status: z.enum(["met", "partial", "pending"]),
            evidence: z.string().describe("Specific quote or fact supporting this status.")
          })).optional(),
          qualityRecord: z.object({
            engagementScore: z.number().min(0).max(1),
            socialDesirabilityFlag: z.boolean().default(false),
            evasionFlag: z.boolean().default(false),
            inconsistencyFlag: z.boolean().default(false),
            reliabilityScore: z.number().min(0).max(1),
            engagementDelta: z.number().optional()
          }).optional(),
          emotionalSignals: z.array(z.object({
            emotionType: z.string(),
            topic: z.string().optional()
          })).optional(),
          summary: z.string().describe("A 1-sentence summary of this exchange.")
        });

        const { output: update, usage } = await generateText({
          model: analysisModel,
          output: Output.object({ schema }),
          system: `You are an expert conversation analyst for Convy V2. 
Audit the latest exchange and update the ExpertState.
SURVEY OBJECTIVE: ${config.coreObjective || "Gather feedback"}`,
          prompt: `Analyze the following exchange:\n${conversationText}`,
          temperature: 0.1,
        });

        logUsage({
          userId: metadata?.userId,
          organizationId: metadata?.organizationId,
          surveyId: config.id,
          type: "llm_text",
          provider: "google",
          modelName: (analysisModel as any).modelId,
          promptTokens: (usage as any).inputTokens,
          completionTokens: (usage as any).outputTokens,
          totalTokens: (usage as any).totalTokens,
        });

        if (update.nodesAddressed) {
          for (const nodeUpdate of update.nodesAddressed) {
            domainBrain.updateNodeStatus(
              expertState,
              nodeUpdate.nodeId,
              nodeUpdate.status,
              nodeUpdate.evidence
            );
          }
          newTurn.coveredNodeIds = update.nodesAddressed.map(nu => nu.nodeId);
        }

        if (update.qualityRecord) {
          expertState.qualitySignals.turnRecords.push({
            turnNumber: lastExchange[0].turnIndex,
            ...update.qualityRecord
          });
        }
      }

      const processResult = await memoryBridge.processTurn(expertState, newTurn);

      if (processResult.transcriptModified) {
        expertState.transcript.turns = processResult.updatedTranscript as any;
        
        if (redis.status === "ready" || redis.status === "connect") {
          await redis.set(
            `session:memory_bridge:${sessionId}`,
            memoryBridge.serializeForRedis()
          );
        }
      }

      await ExpertStateStore.update(config.id, expertState);

    } catch (error) {
      console.error("[ConversationManager] V2 ExpertState update error:", error);
    }
  }

  static getSystemPrompt(
    config: SurveyConfig,
    options: {
      isSample?: boolean;
    } = {},
  ): string {
    const objective = config.coreObjective || config.expertState?.objective?.goal || config.information;
    return `You are a conversational AI interviewer. 
GOAL: ${objective}
GUIDELINE: Be natural, empathetic, and professional. One question at a time.`;
  }

  static getTools(config: SurveyConfig, onMediaDisplay?: (media: any) => void) {
    return {
      showMedia: tool({
        description:
          "Display a media item (image, audio, or video) to the participant in the conversation",
        inputSchema: z.object({
          mediaId: z
            .string()
            .describe("The unique ID of the media item to display"),
        }),
        execute: async ({ mediaId }) => {
          const media = config.media?.find((m) => m.id === mediaId);

          if (!media) {
            return { error: "Media not found" };
          }

          if (onMediaDisplay) {
            onMediaDisplay(media);
          }

          return {
            success: true,
            media: {
              id: media.id,
              type: media.type,
              description: media.description,
              url: media.url,
            },
          };
        },
      }),
      finishSurvey: tool({
        description:
          "Signal that the survey conversation is complete and should end.",
        inputSchema: z.object({
          reason: z.string().optional()
        }),
        execute: async ({ reason }) => {
          return {
            success: true,
            message: "Survey marked as complete",
            reason: reason || "survey complete",
          };
        },
      }),
    };
  }
}
