import { LanguageModel, ModelMessage } from "ai";
import { SurveyConfig } from "@/lib/prompts";
import { RollingContext } from "@/lib/conversation-memory";

export interface SubjectIntelligence {
  userVocabulary: string[];
  knownPainPoints: string[];
  journeySteps: string[];
  intelligentProbes: string[];
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
}

export interface DomainPivot {
  condition: string; // e.g., "if they mention wait times"
  skill: string; // e.g., "STARProber"
  reason: string;
}

export interface ConductingSkill {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export interface AgentConfig {
  name: string;
  role: string;
  description: string;
  model: LanguageModel;
}

export interface AgentContext {
  conversationId: string;
  messages?: ModelMessage[];
  surveyConfig?: SurveyConfig;
  rollingContext?: RollingContext; // For stateful agents like conducting
  ragContext?: string; // Retrieved context from RAG
  knowledgeContext?: string; // Additional context passed from orchestrator
  language?: "en" | "fr" | "de" | "es" | "it"; // Language for the conversation
  // Loaded domain skills (set during agent initialization)
  loadedDomainSkills?: {
    coreContent: string;
    surveyTypeContent: string;
    matchedSurveyType: string | null;
    domainName: string;
  };
  // Subject intelligence from background research (set on ConductingSpecialist only)
  subjectIntelligence?: SubjectIntelligence | null;

  // Self-learning: preloaded at each turn (see base-agent.ts)
  patternLearnings?: string; // Compressed bullet hints from broad search
  skillsMetadata?: string; // Available skills list
  situationalPattern?: {
    // Best-fit single pattern from ContextEngine
    id: string;
    title: string;
    content: string;
    status: string;
    source: "experiment" | "situational" | "vector"; // matches context-engine.ts RetrievedPattern
    experimentVariant?: "control" | "variant";
    experimentId?: string;
    performanceScore?: number | null;
  };
}

export interface AgentResult {
  output: string; // The text response
  toolCalls?: any[]; // Any tool calls made
  metadata?: Record<string, any>; // Extra info like confidence, thoughts
  nextAgent?: string; // For handing off to another agent
  specialist?: string; // Name of specialist that handled it
  response?: string; // Compatibility with Orchestrator tool return
}

export interface Agent {
  process(context: AgentContext): Promise<AgentResult>;
}

export interface ChecklistItem {
  id: string;
  description: string;
  status: "pending" | "met" | "failed";
  evidence?: string;
}

export interface SpecialistChecklist {
  required: ChecklistItem[];
  aspirational: ChecklistItem[];
}
