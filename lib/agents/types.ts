import { LanguageModel, ModelMessage } from "ai";
import { SurveyConfig, SubjectIntelligence } from "@/lib/prompts";
import { MemoryBridge } from "@/lib/memory-bridge";
import { ExpertState } from "../schemas/expert-state";
import type { DomainManifest } from "./skill-system/types";

// SubjectIntelligence relocated to prompts.ts to avoid circular deps

export interface DomainPivot {
  condition: string;
  skill: string;
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
  memoryBridge?: MemoryBridge; // For stateful bounding context window
  expertState?: ExpertState; // V2 Architecture: The source of truth
  ragContext?: string; // Retrieved context from RAG
  knowledgeContext?: string; // Additional context passed from previous turns
  language?: "en" | "fr" | "de" | "es" | "it"; // Language for the conversation
  modality?: "voice" | "text"; // Current modality (V2 Architecture)
  userId?: string;
  organizationId?: string;

  // Sample survey feedback properties
  isSample?: boolean;
  sampleFeedback?: string;
  conversationNumber?: number;

  // Loaded domain skills (set during agent initialization)
  loadedDomainSkills?: {
    coreContent: string;
    surveyTypeContent: string;
    matchedSurveyType: string | null;
    domainName: string;
    hybridDomains?: { id: string; weight: number }[];
    activeNodes?: { id: string; label: string; priority: number }[];
  };
  // Subject intelligence from background research (set on ConductingSpecialist only)
  subjectIntelligence?: SubjectIntelligence | null;

  // Active experimental pattern applied to this session
  situationalPattern?: any;

  // Metadata for available skills
  skillsMetadata?: string;
}

export type { UnifiedSkill } from "./skill-system/types";

export interface AgentResult {
  output: string; // The text response
  toolCalls?: any[]; // Any tool calls made
  metadata?: Record<string, any>; // Extra info like confidence, thoughts
  nextAgent?: string; // For handing off to another agent
  specialist?: string; // Name of specialist that handled it
  response?: string; // Compatibility field
}

export interface Agent {
  process(context: AgentContext): Promise<AgentResult>;
}

export interface ChecklistItem {
  id: string;
  description: string;
  status: "pending" | "partial" | "met" | "failed";
  evidence?: string;
}

export interface SpecialistChecklist {
  required: ChecklistItem[];
  aspirational: ChecklistItem[];
}
