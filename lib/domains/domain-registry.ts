
/**
 * Domain Registry
 * 
 * Central registry for Survey Domains.
 * This file provides the identity (ID, Name) for domains used across the UI and backend.
 * 
 * For behavioral definitions (Skills, Triggers), see `lib/domains/domain-manifest.ts`.
 */

export type SurveyDomainId = 1 | 2 | 3 | 5 | 6 | 7 | 9 | 10;

export interface SurveyDomain {
  id: SurveyDomainId;
  name: string; // Internal name / Fallback. UI uses translation key `Domains.{id}.Title`
}

export const SURVEY_DOMAINS: Record<number, SurveyDomain> = {
  1: { id: 1, name: "Customer Experience & Satisfaction" },
  2: { id: 2, name: "Market Research & Consumer Intelligence" },
  3: { id: 3, name: "Workforce & Organizational Development" },
  5: { id: 5, name: "Education & Learning Assessment" },
  6: { id: 6, name: "Civic Engagement & Public Opinion" },
  7: { id: 7, name: "Scientific & Academic Research" },
  9: { id: 9, name: "Demographic & Social Characterization" },
  10: { id: 10, name: "Infrastructure & Systems Performance" },
};

export function getDomainById(id: number): SurveyDomain | null {
  return SURVEY_DOMAINS[id] ?? null;
}

export function getDomainName(id: number): string {
  const domain = getDomainById(id);
  return domain ? domain.name : "Unknown Domain";
}
