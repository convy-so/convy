
export interface DomainFamily {
  id: number;
  name: string;
  description: string;
  familyFolder: string; // Folder name in .agent/skills
}

export interface SubDomain {
  id: string; // e.g., 'cx-nps-loyalty'
  familyId: number;
  name: string;
  description: string;
  triggerKeywords: string[];
  /** Natural-language example sentences that real users say for this domain */
  semanticExamples: string[];
  /** Minimum feasible session duration (minutes) */
  defaultDurationMinutes: number;
}

export interface UnifiedSkill {
  id: string;
  content: string; // Full markdown with XML sections
  nodes?: { id: string, label: string, priority: number }[]; // Parsed from Coverage Model
}

// ── Domain Manifest (produced by DIE) ────────────────────────────────────────

export type RecommendationType = "single-survey" | "advisory-required" | "decompose";

export type WarningType =
  | "scope-overload"
  | "persona-mismatch"
  | "respondent-mismatch"
  | "insufficient-intent";

export interface DomainRef {
  id: string;
  name: string;
  familyId: number;
  involvementScore: number;
  involvementReason: string;
  /** Bridging node ID connecting this secondary domain to the primary (only on secondary domains) */
  bridgingNodeId?: string;
}

export interface DomainManifest {
  primaryDomain: DomainRef;
  secondaryDomains: DomainRef[];
  coherenceScore: number;
  estimatedSessionMinutes: number;
  recommendation: RecommendationType;
  warnings: WarningType[];
  advisoryMessage: string | null;
  /** Low confidence flag — set when DIE fell back to Stage 1 only */
  confidence: "high" | "low";
}

// ── Compatibility Matrix ──────────────────────────────────────────────────────

export type CompatibilityClassification =
  | "compatible"
  | "compatible-with-warning"
  | "incompatible";

export interface CompatibilityEntry {
  classification: CompatibilityClassification;
  reason: string;
}

// ── Skill Bundle (produced by Skill Assembler) ───────────────────────────────

export interface SkillBundle {
  domainManifest: DomainManifest;
  creationBundle: string;
  conductingBundle: string;
  analyticsBundle: string;
}

// ── Domain Families ───────────────────────────────────────────────────────────

export const DOMAIN_FAMILIES: DomainFamily[] = [
  { id: 1, name: "Customer Experience", description: "Relationship and experience evaluation.", familyFolder: "family1-customer-experience" },
  { id: 2, name: "Physical Product", description: "Sensory, performance, and perception research.", familyFolder: "family2-physical-product" },
  { id: 3, name: "Digital Product", description: "Software, usability, and adoption analysis.", familyFolder: "family3-digital-product" },
  { id: 4, name: "Service Environment", description: "Physical space and hospitality research.", familyFolder: "family4-service-environment" },
  { id: 5, name: "Market Intelligence", description: "Needs, behavior, and competitive landscape.", familyFolder: "family5-market-intelligence" },
  { id: 6, name: "Workforce & Organization", description: "Employee experience and development.", familyFolder: "family6-workforce-organization" },
  { id: 7, name: "B2B & Professional Services", description: "Business-to-business relationships.", familyFolder: "family7-b2b-professional-services" },
  { id: 8, name: "Education & Learning", description: "Course and training effectiveness.", familyFolder: "family8-education-learning" },
  { id: 9, name: "Civic & Public", description: "Public opinion and public service experience.", familyFolder: "family9-civic-public" },
  { id: 10, name: "Scientific Research", description: "Methodological and formal research studies.", familyFolder: "family10-scientific-research" },
  { id: 11, name: "Media & Entertainment", description: "Content, audience, and gaming experience.", familyFolder: "family11-media-entertainment" },
  { id: 12, name: "Built Environment", description: "Residential, workplace, and community research.", familyFolder: "family12-built-environment" },
  { id: 13, name: "Financial & Legal Services", description: "Banking, insurance, and professional advisory.", familyFolder: "family13-financial-legal-services" },
];
