import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { surveys, surveyConversations, sampleConversations } from "@/db/schema";
import type { ExpertState } from "@/lib/schemas/expert-state";

/**
 * Convy V2 Architecture: Session Lifecycle Manager
 * 
 * A deterministic state machine that manages the transitions of a conversation 
 * based on the expertState.sessionMeta.status.
 */
export class SessionLifecycleManager {
  private db = getDb();

  /**
   * Initializes a new conducting session (either sample or real respondent).
   * Copies the static 'Creator' state (brief, audienceModel) into a fresh session state.
   */
  async initializeConductingSession(
    surveyId: string,
    isSample: boolean,
    participantId?: string
  ): Promise<{ conversationId: string; expertState: ExpertState }> {
    const surveyData = await this.db.select().from(surveys).where(eq(surveys.id, surveyId));
    const survey = surveyData[0];
    
    if (!survey) {
      throw new Error("Survey not found");
    }

    const baseExpertState = (survey.expertState || {}) as ExpertState;

    // Construct the isolated session state
    const sessionExpertState: ExpertState = {
      // Inherit the global brief and audience model from the creator
      brief: baseExpertState.brief,
      audienceModel: baseExpertState.audienceModel,
      
      // Initialize fresh session-specific state
      coverageTracker: {
        nodes: [], // Will be populated by the Domain Brain / RAG
        overallCoverage: 0,
        bookmarkedNodes: [],
        currentTopicId: null,
      },
      respondentProfile: {
        engagementTrajectory: [],
        forthcomingTopics: [],
        evadedTopics: [],
        emotionalSignals: []
      },
      qualitySignals: {
        turnRecords: [],
        sessionAggregates: {
          overallReliability: 1,
          socialDesirabilityIndex: 0,
          evasionIndex: 0
        }
      },
      transcript: { turns: [] },
      pendingAdaptations: { adaptations: [] },
      dataGovernance: {
        consentGranted: false,
        piiMaskingRequired: true
      },
      recoveryState: {
        consecutiveErrorCount: 0
      },
      telemetry: {
        totalTokensUsed: 0,
        computeDurationMs: 0
      },
      
      // The crucial status field
      sessionMeta: {
        status: "warmup",
        modality: survey.isVoice ? "voice" : "text"
      }
    };

    const newId = crypto.randomUUID();

    if (isSample) {
      // Very basic id parsing
      let convNum = 1;
      const latestSample = await this.db.select()
        .from(sampleConversations)
        .where(eq(sampleConversations.surveyId, surveyId));
      if (latestSample.length > 0) {
        convNum = latestSample.length + 1;
      }

      await this.db.insert(sampleConversations).values({
        id: newId,
        surveyId,
        conversationNumber: convNum,
        messages: [],
        expertState: sessionExpertState as any
      });
    } else {
      await this.db.insert(surveyConversations).values({
        id: newId,
        surveyId,
        participantId: participantId || null,
        rawConversation: [],
        expertState: sessionExpertState as any
      });
    }

    // Phase 4: This is where we will trigger RAG queries based on the domain
    // and inject them into the Conducting Bundle.

    return { conversationId: newId, expertState: sessionExpertState };
  }

  /**
   * Evaluates the current state of a session after a turn to determine if a transition is needed.
   */
  async evaluateSessionState(
    conversationId: string, 
    isSample: boolean, 
    currentState: ExpertState
  ): Promise<void> {
    
    // 1. Check for critical quality failures (Evasion, Social Desirability thresholds)
    if (currentState.qualitySignals.sessionAggregates.overallReliability < 0.4) {
      await this.transitionState(conversationId, isSample, currentState, "flagged_low_quality");
      return;
    }

    // 2. Check for completion (Coverage threshold met)
    const IS_COVERAGE_COMPLETE = currentState.coverageTracker.overallCoverage >= 0.85; // Example threshold
    
    if (IS_COVERAGE_COMPLETE && currentState.sessionMeta.status === "core_survey") {
      await this.transitionState(conversationId, isSample, currentState, "coverage_complete");
      return;
    }

  }

  /**
   * Performs the strict state transition and fires async handlers
   */
  async transitionState(
    conversationId: string, 
    isSample: boolean, 
    state: ExpertState, 
    targetStatus: ExpertState["sessionMeta"]["status"]
  ) {
    const previousStatus = state.sessionMeta.status;
    state.sessionMeta.status = targetStatus;

    // 1. Persist the state change
    const table = isSample ? sampleConversations : surveyConversations;
    await this.db.update(table as any)
      .set({ expertState: state as any })
      .where(eq((table as any).id, conversationId));

    console.log(`[Lifecycle Manager] Session ${conversationId} transitioned: ${previousStatus} -> ${targetStatus}`);

    // 2. Fire transition handlers
    switch (targetStatus) {
      case "coverage_complete":
        await this.handleCoverageComplete(conversationId, isSample, state);
        break;
      case "flagged_low_quality":
        await this.handleFlaggedLowQuality(conversationId, isSample, state);
        break;
      // ...
    }
  }

  private async handleCoverageComplete(conversationId: string, isSample: boolean, state: ExpertState) {
    console.log(`[Lifecycle Manager] Triggering Analytics for ${conversationId}`);
    // Change to awaiting_analytics
    await this.transitionState(conversationId, isSample, state, "analytics_running");
    
    // TODO: Phase 5 - Queue the specific Analytics Agent job here
  }

  private async handleFlaggedLowQuality(conversationId: string, isSample: boolean, state: ExpertState) {
    console.log(`[Lifecycle Manager] Session ${conversationId} flagged for low quality. Halting automated analytics.`);
    // We intentionally skip firing the Analytics queue.
  }
}

export const sessionLifecycleManager = new SessionLifecycleManager();
