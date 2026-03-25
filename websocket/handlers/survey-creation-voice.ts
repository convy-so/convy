import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  surveyCreationConversations,
  surveys,
  voiceSessions,
} from "@/db/schema";
import {
  getEducationProgram,
  classifyEducationProgramHeuristically,
} from "@/lib/education/catalog";
import type {
  CreationCollectedInfo,
  EducationProgramId,
  ResearchBrief,
} from "@/lib/education/types";
import {
  persistCreationConversation,
  runCreationWorkflow,
  type CreationMessage,
} from "@/lib/education/creation-workflow";
import { getPhasePlaybookContext } from "@/lib/education/runtime-context";
import { getSurveyPermissionContext } from "@/lib/workspace-access";
import {
  acquireSurveyLease,
  publishPendingOutboxEntries,
  recordRealtimeEvent,
  releaseSurveyLease,
  renewSurveyLease,
} from "@/lib/collaboration-service";
import type { AuthenticatedConnection } from "../middleware/auth";
import { BaseVoiceAgentHandler } from "./base-voice-agent-handler";
import {
  buildVoiceAgentSettings,
  type ConversationTextEvent,
  type FunctionCallRequestEvent,
  type SupportedLanguage,
  type VoiceAgentFunction,
  type VoiceAgentSettings,
} from "@/lib/voice/deepgram-voice-agent";

interface CreationState {
  surveyId: string | null;
  voiceSessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  collectedInfo: CreationCollectedInfo;
  language: SupportedLanguage;
  brief: ResearchBrief | null;
  missingFields: string[];
  readyForSampling: boolean;
}

const EMPTY_COLLECTED_INFO: CreationCollectedInfo = {
  objective: false,
  targetAudience: false,
  scope: false,
  successCriteria: false,
  constraints: false,
  hypotheses: false,
  tone: false,
  requiredQuestions: false,
  metrics: false,
  personalInfo: false,
  subjectDefined: false,
  programIdentified: false,
  media: false,
  subjectModelComplete: false,
};

function inferProgramId(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const creatorText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  return classifyEducationProgramHeuristically(creatorText).programId;
}

async function buildCreationSystemPrompt(
  state: CreationState,
  organizationId?: string | null,
) {
  const programId =
    state.brief?.programId ||
    inferProgramId(state.messages) ||
    ("education.course_efficacy" as EducationProgramId);
  const program = getEducationProgram(programId);
  const brief = state.brief;

  const missingFieldText =
    state.missingFields.length > 0 ? state.missingFields.join(", ") : "none";
  const playbookContext = state.surveyId
    ? await getPhasePlaybookContext({
        surveyId: state.surveyId,
        organizationId: organizationId ?? null,
        phase: "creation",
      })
    : "";

  return `${program.creationPrompt}

You are helping a creator define an education research study. Keep the exchange concise, clear, and practical.

${playbookContext ? `Approved creation playbooks:\n${playbookContext}\n` : ""}

Current draft brief:
- Program: ${program.manifest.displayName}
- Title: ${brief?.title || "Not set yet"}
- Goal: ${brief?.researchGoal || "Missing"}
- Decision to inform: ${brief?.decisionToInform || "Missing"}
- Audience: ${brief?.audienceDefinition || "Missing"}
- Learning context: ${brief?.learningContext || "Missing"}
- Delivery context: ${brief?.deliveryContext || "Missing"}
- Time window: ${brief?.timeWindow || "Missing"}
- Required topics: ${brief?.requiredTopics.join(", ") || "Missing"}
- Success criteria: ${brief?.successCriteria.join(", ") || "Missing"}
- Analysis questions: ${brief?.analysisQuestions.join(", ") || "Missing"}
- Missing fields: ${missingFieldText}
- Ready for sampling: ${state.readyForSampling ? "yes" : "no"}

Instructions:
- Ask exactly one question at a time.
- Focus on the highest-priority missing field or contradiction.
- If the brief is ready, say so clearly and invite the creator to move to sample review.
- Never mention internal JSON, hidden state, or implementation details.`;
}

function buildCreationFunctions(): VoiceAgentFunction[] {
  return [
    {
      name: "finishSurvey",
      description:
        "Call this only when the education study brief is complete and ready for sample review.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "requestMediaUpload",
      description:
        "Call this if you explicitly need the creator to upload supporting survey media.",
      parameters: {
        type: "object",
        properties: {
          allowedTypes: {
            type: "array",
            items: { type: "string" },
            description: "Allowed media types, such as image, audio, or video.",
          },
        },
        required: ["allowedTypes"],
        additionalProperties: false,
      },
    },
  ];
}

function toCreationMessages(
  messages: CreationState["messages"],
): CreationMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  }));
}

function buildCollectedInfo(
  brief: ResearchBrief,
  readyForSampling: boolean,
): CreationCollectedInfo {
  return {
    objective: Boolean(brief.researchGoal),
    targetAudience: Boolean(brief.audienceDefinition),
    scope: brief.requiredTopics.length > 0,
    successCriteria: brief.successCriteria.length > 0,
    constraints: true,
    hypotheses: brief.assumptions.length > 0,
    tone: Boolean(brief.tone),
    requiredQuestions: brief.requiredQuestions.length > 0,
    metrics: brief.metrics.length > 0,
    personalInfo: brief.personalInfo.length > 0,
    subjectDefined: Boolean(brief.learningContext),
    programIdentified: Boolean(brief.programId),
    media: true,
    subjectModelComplete: readyForSampling,
  };
}

export class SurveyCreationVoiceHandler extends BaseVoiceAgentHandler {
  private state: CreationState;
  private sessionStartTime = Date.now();
  private leaseToken: string | null = null;

  constructor(connection: AuthenticatedConnection) {
    super(connection.ws, `creation-${connection.userId}`, connection.userId);

    this.state = {
      surveyId: null,
      voiceSessionId: nanoid(),
      messages: [],
      collectedInfo: { ...EMPTY_COLLECTED_INFO },
      language: "en",
      brief: null,
      missingFields: [],
      readyForSampling: false,
    };
  }

  async initialize(): Promise<void> {
    try {
      await getDb().insert(voiceSessions).values({
        id: this.state.voiceSessionId,
        userId: this.userId,
        sessionType: "survey_creation",
        status: "active",
        startedAt: new Date(),
      });

      this.resetIdleTimeout();
      this.send({
        type: "ready",
        voiceSessionId: this.state.voiceSessionId,
      });
    } catch (error) {
      console.error("[Survey Creation Voice] Initialization error:", error);
      this.sendError("Failed to initialize voice session");
    }
  }

  protected getLanguage(): SupportedLanguage {
    return this.state.language;
  }

  protected getInitialUserInput(): string | null {
    return null;
  }

  protected isNewSession(): boolean {
    return this.state.messages.length === 0;
  }

  protected async getVoiceAgentSettings(): Promise<VoiceAgentSettings> {
    const greeting =
      this.state.messages.length === 0
        ? "Hi. I’ll help you shape this education study. What learning program or experience do you want feedback on?"
        : undefined;

    return buildVoiceAgentSettings({
      language: this.state.language,
      systemPrompt: await buildCreationSystemPrompt(
        this.state,
        this.organizationId ?? null,
      ),
      functions: buildCreationFunctions(),
      greeting,
      conversationHistory:
        this.state.messages.length > 0
          ? this.state.messages.map((message) => ({
              role: message.role,
              content: message.content,
            }))
          : undefined,
    });
  }

  protected async onFunctionCall(event: FunctionCallRequestEvent): Promise<void> {
    try {
      if (event.function_name === "requestMediaUpload") {
        const allowedTypes = Array.isArray(event.input?.allowedTypes)
          ? event.input.allowedTypes
          : ["image", "audio", "video"];

        this.send({
          type: "request_media_upload",
          allowedTypes,
        });
        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({
            success: true,
            message: "Upload UI presented to user.",
          }),
        );
        return;
      }

      if (event.function_name === "finishSurvey") {
        if (!this.state.surveyId) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({ error: "Survey is not linked yet" }),
          );
          return;
        }

        const result = await runCreationWorkflow({
          surveyId: this.state.surveyId,
          messages: toCreationMessages(this.state.messages),
          userId: this.userId || undefined,
          organizationId: this.organizationId ?? null,
        });
        await this.persistWorkflowResult(result);
        await this.broadcastCreationUpdate();

        if (!result.validation.isReady) {
          this.voiceAgent?.sendFunctionCallResponse(
            event.function_call_id,
            event.function_name,
            JSON.stringify({
              error: "The brief is not complete enough to finish yet",
              missingFields: result.validation.missingFields,
            }),
          );
          return;
        }

        this.voiceAgent?.sendFunctionCallResponse(
          event.function_call_id,
          event.function_name,
          JSON.stringify({ success: true }),
        );
        this.send({ type: "survey_completed" });
        return;
      }

      this.voiceAgent?.sendFunctionCallResponse(
        event.function_call_id,
        event.function_name,
        JSON.stringify({ error: "Function not found" }),
      );
    } catch (error) {
      console.error("[Survey Creation Voice] Tool call error:", error);
      this.voiceAgent?.sendFunctionCallResponse(
        event.function_call_id,
        event.function_name,
        JSON.stringify({ error: "Internal error executing function" }),
      );
    }
  }

  protected async onConversationText(event: ConversationTextEvent): Promise<void> {
    const leaseOk = await this.ensureCreationLease();
    if (!leaseOk) {
      return;
    }

    const now = new Date();
    const lastMessage = this.state.messages[this.state.messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === event.role &&
      now.getTime() - new Date(lastMessage.timestamp).getTime() < 3000
    ) {
      lastMessage.content += ` ${event.content}`;
      lastMessage.timestamp = now.toISOString();
    } else {
      this.state.messages.push({
        role: event.role,
        content: event.content,
        timestamp: now.toISOString(),
      });
    }

    await this.saveConversation();

    if (event.role !== "user" || !this.state.surveyId) {
      await this.broadcastCreationUpdate();
      return;
    }

    const result = await runCreationWorkflow({
      surveyId: this.state.surveyId,
      messages: toCreationMessages(this.state.messages),
      userId: this.userId || undefined,
      organizationId: this.organizationId ?? null,
    });
    await this.persistWorkflowResult(result);
    await this.broadcastCreationUpdate();

    this.voiceAgent?.updateThink({
      provider: { type: "open_ai", model: "gpt-4o-mini" },
      prompt: `${await buildCreationSystemPrompt(
        this.state,
        this.organizationId ?? null,
      )}\n\nRespond in the language the creator is speaking.`,
      functions: buildCreationFunctions(),
    });
  }

  protected async handleControlMessage(message: any): Promise<void> {
    switch (message.type) {
      case "set_survey_id": {
        try {
          const surveyId = String(message.surveyId || "");
          const permission = await getSurveyPermissionContext(this.userId, surveyId);
          if (!permission?.canEdit) {
            this.send({ type: "error", error: "Unauthorized: Editor access required" });
            return;
          }

          this.state.surveyId = surveyId;
          await this.loadExistingState();
          this.send({ type: "survey_state_loaded" });
        } catch (error) {
          console.error("[Survey Creation Voice] Failed to load survey state:", error);
          this.sendError("Failed to load survey state");
        }
        return;
      }

      case "start_conversation":
        if (this.state.surveyId) {
          const leaseOk = await this.ensureCreationLease();
          if (!leaseOk) {
            return;
          }
        }
        await this.loadExistingState();
        await this.connectVoiceAgent();
        return;

      case "text_message":
        if (message.text && this.voiceAgent?.connected) {
          this.voiceAgent.sendInjectUserMessage(message.text);
        }
        return;

      case "set_language":
        if (
          message.language &&
          ["en", "fr", "de", "es", "it"].includes(message.language)
        ) {
          this.state.language = message.language;
          if (this.state.surveyId) {
            await getDb()
              .update(surveys)
              .set({ language: message.language, updatedAt: new Date() })
              .where(eq(surveys.id, this.state.surveyId));
          }
          if (this.voiceAgent?.connected) {
            await this.reconnectVoiceAgent();
          }
        }
        return;
    }
  }

  private async loadExistingState(): Promise<void> {
    if (!this.state.surveyId) return;

    const [conversation, survey] = await Promise.all([
      getDb()
        .select()
        .from(surveyCreationConversations)
        .where(eq(surveyCreationConversations.surveyId, this.state.surveyId))
        .then((rows) => rows[0]),
      getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.id, this.state.surveyId))
        .then((rows) => rows[0]),
    ]);

    if (survey) {
      this.organizationId = survey.organizationId;
      this.surveyId = survey.id;
      if (["en", "fr", "de", "es", "it"].includes(survey.language)) {
        this.state.language = survey.language as SupportedLanguage;
      }

      await getDb()
        .update(voiceSessions)
        .set({ surveyId: survey.id })
        .where(eq(voiceSessions.id, this.state.voiceSessionId));
    }

    if (!conversation) return;

    this.state.messages = ((conversation.messages as CreationState["messages"]) || []).map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    }));

    const extractedData = (conversation.extractedData || {}) as Record<string, any>;
    this.state.brief = extractedData.brief || null;
    this.state.missingFields = Array.isArray(extractedData.missingFields)
      ? extractedData.missingFields.map(String)
      : [];
    this.state.readyForSampling = Boolean(extractedData.readyForSampling);
    this.state.collectedInfo = {
      ...EMPTY_COLLECTED_INFO,
      ...(conversation.collectedInfo as CreationCollectedInfo),
    };
  }

  private async saveConversation(): Promise<void> {
    if (!this.state.surveyId) return;

    await persistCreationConversation(this.state.surveyId, toCreationMessages(this.state.messages));
  }

  private async ensureCreationLease() {
    if (!this.state.surveyId) {
      return true;
    }

    if (this.leaseToken) {
      const renewed = await renewSurveyLease({
        surveyId: this.state.surveyId,
        stage: "creation",
        userId: this.userId,
        leaseToken: this.leaseToken,
      });

      if (renewed.ok) {
        return true;
      }
    }

    const acquired = await acquireSurveyLease({
      surveyId: this.state.surveyId,
      stage: "creation",
      userId: this.userId,
      sessionId: this.state.voiceSessionId,
    });

    if (!acquired.ok) {
      const holderId =
        "lease" in acquired && acquired.lease?.holderUserId
          ? acquired.lease.holderUserId
          : null;
      this.send({
        type: "error",
        error: holderId
          ? `Another editor currently controls survey creation (${holderId}).`
          : "Another editor currently controls survey creation.",
      });
      return false;
    }

    this.leaseToken = acquired.lease.leaseToken;
    await this.broadcastLeaseEvent("survey.lease_acquired", acquired.lease.expiresAt);
    return true;
  }

  private async broadcastCreationUpdate() {
    if (!this.state.surveyId) return;

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: this.state.surveyId,
        actorId: this.userId,
        eventType: "survey.creation_turn_added",
        payload: {
          surveyId: this.state.surveyId,
          messageCount: this.state.messages.length,
          readyForSampling: this.state.readyForSampling,
          status: this.state.readyForSampling ? "sample_review" : "creating",
          source: "voice",
        },
      });
    });

    await publishPendingOutboxEntries();
  }

  private async broadcastLeaseEvent(
    eventType: "survey.lease_acquired" | "survey.lease_released",
    expiresAt?: Date | null,
  ) {
    if (!this.state.surveyId) return;

    await getDb().transaction(async (tx) => {
      await recordRealtimeEvent(tx, {
        scope: "survey",
        surveyId: this.state.surveyId,
        actorId: this.userId,
        eventType,
        payload: {
          surveyId: this.state.surveyId,
          stage: "creation",
          holderUserId:
            eventType === "survey.lease_released" ? null : this.userId,
          holderSessionId:
            eventType === "survey.lease_released"
              ? null
              : this.state.voiceSessionId,
          expiresAt: expiresAt?.toISOString() ?? null,
          source: "voice",
        },
      });
    });

    await publishPendingOutboxEntries();
  }

  private async persistWorkflowResult(result: Awaited<ReturnType<typeof runCreationWorkflow>>) {
    if (!this.state.surveyId) return;

    this.state.brief = result.brief;
    this.state.missingFields = result.validation.missingFields;
    this.state.readyForSampling = result.validation.isReady;
    this.state.collectedInfo = buildCollectedInfo(
      result.brief,
      result.validation.isReady,
    );

    await getDb()
      .update(surveyCreationConversations)
      .set({
        extractedData: {
          programId: result.brief.programId,
          objective: {
            goal: result.brief.researchGoal,
            context: result.brief.learningContext,
            decision: result.brief.decisionToInform,
          },
          targetAudience: {
            description: result.brief.audienceDefinition,
            relationship: result.brief.audienceRelationship,
            knowledgeLevel: result.brief.audienceKnowledgeLevel,
          },
          scope: {
            breadthVsDepth: "balanced",
            mainTopics: result.brief.requiredTopics,
            boundaries: result.brief.deliveryContext,
          },
          successCriteria: {
            insightTypes: ["behavioral", "rational"],
            detailLevel: "high",
            description: result.brief.successCriteria.join(", "),
          },
          constraints: {
            timeLimit: null,
            sensitiveTopics: result.brief.riskFlags,
            otherConstraints: result.brief.constraints.join(", "),
          },
          tone: result.brief.tone,
          requiredQuestions: result.brief.requiredQuestions,
          metrics: result.brief.metrics,
          personalInfo: result.brief.personalInfo,
          brief: result.brief,
          missingFields: result.validation.missingFields,
          readyForSampling: result.validation.isReady,
        },
        collectedInfo: this.state.collectedInfo,
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId));
  }

  protected async cleanup(): Promise<void> {
    await super.cleanup();

    if (this.state.surveyId && this.leaseToken) {
      const releaseResult = await releaseSurveyLease({
        surveyId: this.state.surveyId,
        stage: "creation",
        userId: this.userId,
        leaseToken: this.leaseToken,
      }).catch((error) => {
        console.error(error);
        return null;
      });
      if (releaseResult?.ok) {
        await this.broadcastLeaseEvent("survey.lease_released").catch(console.error);
      }
      this.leaseToken = null;
    }

    getDb()
      .update(voiceSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(voiceSessions.id, this.state.voiceSessionId))
      .catch(console.error);

    if (!this.state.surveyId) return;

    const sessionDurationMs = Date.now() - this.sessionStartTime;
    await getDb()
      .update(surveyCreationConversations)
      .set({
        durationMs: sessionDurationMs,
        activeDurationMs: Math.round(this.activeDurationMs),
        updatedAt: new Date(),
      })
      .where(eq(surveyCreationConversations.surveyId, this.state.surveyId))
      .catch(console.error);
  }
}
