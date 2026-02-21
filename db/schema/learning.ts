/**
 * Learning System Schema
 *
 * Tables that power the self-improving survey agent:
 *  - conversation_signals   : objective post-conversation metrics (ground truth)
 *  - conversation_moves     : atomic (AI question + participant response) pairs
 *  - participant_feedback   : post-conversation micro-rating with discomfort flag
 *  - experiments            : A/B test registry (situational, not user-level)
 *  - experiment_outcomes    : per-move outcome rows for statistical evaluation
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./common";
import { surveyConversations } from "./surveys";
import { knowledgeBase } from "./vectors";

// ---------------------------------------------------------------------------
// conversation_signals
// Objective metrics computed after every survey conversation ends.
// These are the "ground truth" signals that replace LLM-assigned quality scores.
// ---------------------------------------------------------------------------
export const conversationSignals = pgTable(
  "conversation_signals",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").notNull(),

    // Completion & dropoff
    completionRate: real("completion_rate").notNull().default(0), // 0-1
    dropoffTurnIndex: integer("dropoff_turn_index"), // null if completed
    totalTurns: integer("total_turns").notNull().default(0),

    // Response depth
    avgWordsPerResponse: real("avg_words_per_response").notNull().default(0),
    oneWordResponseCount: integer("one_word_response_count").notNull().default(0),
    offtopicResponseCount: integer("offtopic_response_count").notNull().default(0),

    // Objective coverage (LLM call with fixed rubric — repeatable)
    objectiveCoverageScore: real("objective_coverage_score").notNull().default(0), // 0-1
    missedObjectives: jsonb("missed_objectives")
      .$type<string[]>()
      .default([]),

    // Participant style detection
    detectedStyle: text("detected_style", {
      enum: ["verbose", "concise", "hesitant", "neutral"],
    }),
    styleDetectionConfidence: real("style_detection_confidence"), // 0-1

    // Aggregate richness score derived from move data
    avgResponseRichnessScore: real("avg_response_richness_score").default(0),
  },
  (table) => [
    index("conversation_signals_conversation_id_idx").on(table.conversationId),
    index("conversation_signals_survey_id_idx").on(table.surveyId),
  ]
);

// ---------------------------------------------------------------------------
// conversation_moves
// Atomic unit: one AI question + one participant response.
// This is where learning is attributed — not at the conversation level.
// ---------------------------------------------------------------------------
export const conversationMoves = pgTable(
  "conversation_moves",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").notNull(),
    turnIndex: integer("turn_index").notNull(), // 0-based index within conversation

    // The actual content
    aiQuestion: text("ai_question").notNull(),
    participantResponse: text("participant_response").notNull(),

    // Technique metadata (populated if agent used a known technique)
    techniqueId: text("technique_id"), // FK to knowledge_base.id if applicable
    techniqueCategory: text("technique_category"), // questioning|probing|transition|engagement

    // Conversation phase at this turn
    phase: text("phase", {
      enum: ["opening", "exploration", "deepdive", "closing"],
    }),

    // Signal: outcome of this specific move
    responseWordCount: integer("response_word_count").notNull().default(0),
    responseRichnessScore: real("response_richness_score").notNull().default(0), // 0-1
    ledToAbandonment: boolean("led_to_abandonment").notNull().default(false),

    // Context snapshot at this turn
    participantStyleAtTurn: text("participant_style_at_turn"),
    topicsDiscussedSoFar: jsonb("topics_discussed_so_far")
      .$type<string[]>()
      .default([]),
  },
  (table) => [
    index("conversation_moves_conversation_id_idx").on(table.conversationId),
    index("conversation_moves_survey_id_idx").on(table.surveyId),
    index("conversation_moves_technique_id_idx").on(table.techniqueId),
  ]
);

// ---------------------------------------------------------------------------
// participant_feedback
// Post-conversation micro-rating submitted by the participant.
// uncomfortableTopics = true → HARD VETO on any pattern from this conversation.
// ---------------------------------------------------------------------------
export const participantFeedback = pgTable(
  "participant_feedback",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    conversationId: text("conversation_id")
      .notNull()
      .references(() => surveyConversations.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").notNull(),

    // Rating: 1-5 (emoji scale shown to participant)
    rating: integer("rating"), // nullable; participant may skip rating

    // Lightweight experience flags
    feltNatural: boolean("felt_natural"),
    uncomfortableTopics: boolean("uncomfortable_topics").notNull().default(false),

    // Optional free text (only prompted for rating ≤ 2)
    freeText: text("free_text"),
  },
  (table) => [
    index("participant_feedback_conversation_id_idx").on(table.conversationId),
    index("participant_feedback_survey_id_idx").on(table.surveyId),
  ]
);

// ---------------------------------------------------------------------------
// experiments
// A/B test registry; each row is a situational experiment comparing two patterns.
// Unit of randomization is (phase, style, obstacle) — NOT users.
// ---------------------------------------------------------------------------
export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    name: text("name").notNull(),
    status: text("status", {
      enum: ["active", "concluded", "paused"],
    })
      .notNull()
      .default("active"),

    // Situation this experiment targets
    effectivePhase: text("effective_phase"),
    effectiveStyle: text("effective_style"),
    effectiveObstacle: text("effective_obstacle"),

    // The two competing patterns
    controlPatternId: text("control_pattern_id").references(
      () => knowledgeBase.id,
      { onDelete: "set null" }
    ),
    variantPatternId: text("variant_pattern_id").references(
      () => knowledgeBase.id,
      { onDelete: "set null" }
    ),

    // Traffic + statistics config
    trafficSplit: real("traffic_split").notNull().default(0.5), // fraction going to variant
    minSampleSize: integer("min_sample_size").notNull().default(30), // per variant

    // Outcome
    concludedAt: timestamp("concluded_at", { withTimezone: true, mode: "date" }),
    winnerId: text("winner_id"), // pattern id that won; null = inconclusive
  },
  (table) => [
    index("experiments_status_idx").on(table.status),
    index("experiments_situation_idx").on(
      table.effectivePhase,
      table.effectiveStyle,
      table.effectiveObstacle
    ),
  ]
);

// ---------------------------------------------------------------------------
// experiment_outcomes
// One row per move that was served under an active experiment.
// Accumulated and evaluated nightly for statistical significance.
// ---------------------------------------------------------------------------
export const experimentOutcomes = pgTable(
  "experiment_outcomes",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    moveId: text("move_id")
      .notNull()
      .references(() => conversationMoves.id, { onDelete: "cascade" }),

    // Which branch received this move
    assignedVariant: text("assigned_variant", {
      enum: ["control", "variant"],
    }).notNull(),

    // Outcome signals (copied from move for self-contained analysis)
    responseWordCount: integer("response_word_count").notNull().default(0),
    responseRichnessScore: real("response_richness_score").notNull().default(0),
    ledToAbandonment: boolean("led_to_abandonment").notNull().default(false),
  },
  (table) => [
    index("experiment_outcomes_experiment_id_idx").on(table.experimentId),
    index("experiment_outcomes_move_id_idx").on(table.moveId),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const conversationSignalsRelations = relations(
  conversationSignals,
  ({ one }) => ({
    conversation: one(surveyConversations, {
      fields: [conversationSignals.conversationId],
      references: [surveyConversations.id],
    }),
  })
);

export const conversationMovesRelations = relations(
  conversationMoves,
  ({ one, many }) => ({
    conversation: one(surveyConversations, {
      fields: [conversationMoves.conversationId],
      references: [surveyConversations.id],
    }),
    experimentOutcomes: many(experimentOutcomes),
  })
);

export const participantFeedbackRelations = relations(
  participantFeedback,
  ({ one }) => ({
    conversation: one(surveyConversations, {
      fields: [participantFeedback.conversationId],
      references: [surveyConversations.id],
    }),
  })
);

export const experimentsRelations = relations(experiments, ({ many }) => ({
  outcomes: many(experimentOutcomes),
}));

export const experimentOutcomesRelations = relations(
  experimentOutcomes,
  ({ one }) => ({
    experiment: one(experiments, {
      fields: [experimentOutcomes.experimentId],
      references: [experiments.id],
    }),
    move: one(conversationMoves, {
      fields: [experimentOutcomes.moveId],
      references: [conversationMoves.id],
    }),
  })
);
