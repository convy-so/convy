import { SUB_DOMAINS } from "@/lib/agents/skill-system/registry";
import type { CompatibilityEntry } from "@/lib/agents/skill-system/types";

/**
 * Domain duration lookup — minutes per domain.
 * Derived from registry.defaultDurationMinutes at import time.
 * Zero overhead — just a plain object lookup.
 */
export const DOMAIN_DURATIONS: Record<string, number> = Object.fromEntries(
  SUB_DOMAINS.map((d) => [d.id, d.defaultDurationMinutes]),
);

/**
 * Estimate combined session duration for a primary + set of secondary domains.
 * Formula: primary + sum(secondary * 0.30), * 1.10 for transition overhead.
 */
export function estimateCombinedDuration(
  primaryId: string,
  secondaryIds: string[],
): number {
  const primaryMins = DOMAIN_DURATIONS[primaryId] ?? 20;
  const secondaryMins = secondaryIds.reduce(
    (sum, id) => sum + (DOMAIN_DURATIONS[id] ?? 18) * 0.3,
    0,
  );
  return Math.round((primaryMins + secondaryMins) * 1.1);
}

/**
 * Compatibility matrix for domain pairs.
 * Key format: "{lower_id}:{higher_id}" (alphabetically ordered for deterministic lookup).
 *
 * Family-level defaults:
 *   - Same family → compatible
 *   - Different family, same broad category → compatible-with-warning
 *   - Fundamentally different respondent pools → incompatible
 *
 * Only notable cross-family pairs are listed explicitly below.
 * All unlisted pairs default to "compatible-with-warning".
 */
const EXPLICIT_COMPAT: Record<string, CompatibilityEntry> = {
  // Built Environment — highly compatible within family
  "be-community-neighborhood:be-residential-tenant": {
    classification: "compatible",
    reason: "Tenants are natural community observers — neighborhood influence on residential decision is well-established",
  },
  "be-community-neighborhood:be-workplace-utilization": {
    classification: "compatible-with-warning",
    reason: "Community and workplace are distinct respondent contexts — confirm same person can speak to both",
  },
  "be-residential-tenant:be-workplace-utilization": {
    classification: "compatible-with-warning",
    reason: "Residential and workplace are distinct lived contexts — valid but scope can grow",
  },

  // Workforce — compatible within family
  "wo-culture-assessment:wo-employee-engagement": {
    classification: "compatible",
    reason: "Culture and engagement are deeply intertwined employee experience topics",
  },
  "wo-dei-experience:wo-employee-engagement": {
    classification: "compatible",
    reason: "DEI experience is a dimension of overall employee engagement",
  },
  "wo-exit-departure:wo-employee-engagement": {
    classification: "compatible",
    reason: "Exit interviews naturally surface engagement drivers",
  },
  "wo-360-feedback:wo-manager-effectiveness": {
    classification: "compatible",
    reason: "360 feedback and manager effectiveness research serve the same development goal",
  },

  // Customer Experience — compatible within family
  "cx-nps-loyalty:cx-post-transaction": {
    classification: "compatible",
    reason: "Transaction experience data enriches loyalty research",
  },
  "cx-client-relationship:cx-service-recovery": {
    classification: "compatible",
    reason: "Recovery episodes are defining moments in client relationships",
  },
  "cx-onboarding:cx-nps-loyalty": {
    classification: "compatible-with-warning",
    reason: "Onboarding and loyalty address different maturity stages — confirm respondent has been through both",
  },

  // Cross-family: CX + WO
  "cx-employee-engagement:wo-employee-engagement": {
    classification: "incompatible",
    reason: "Customer experience and workforce research require different respondent populations",
  },

  // Cross-family: Built Environment + Civic
  "be-community-neighborhood:cp-citizen-service": {
    classification: "compatible-with-warning",
    reason: "Community experience and citizen services overlap for residents — scope can expand",
  },
  "be-community-neighborhood:cp-community-trust": {
    classification: "compatible",
    reason: "Community safety and trust are central to neighborhood experience research",
  },

  // Digital + Market Intelligence — often co-researched
  "dp-usability-ux:mi-proposition-testing": {
    classification: "compatible-with-warning",
    reason: "UX and proposition testing can co-exist but require careful question ordering",
  },
  "dp-adoption-feature:mi-needs-behavior": {
    classification: "compatible",
    reason: "Feature adoption is motivated by underlying unmet needs — natural combination",
  },

  // Scientific + any consumer domain
  "sr-clinical-trial:cx-nps-loyalty": {
    classification: "incompatible",
    reason: "Clinical trial participants and consumer loyalty respondents are incompatible populations",
  },
  "sr-formal-methodology:wo-employee-engagement": {
    classification: "incompatible",
    reason: "Formal academic methodology and applied employee research require different frames",
  },

  // Financial + CX — common combination
  "cx-post-transaction:fn-banking-trust": {
    classification: "compatible",
    reason: "Post-transaction research in a financial context naturally surfaces trust dimensions",
  },
  "cx-service-recovery:fn-insurance-claims": {
    classification: "compatible",
    reason: "Insurance claims are a specific version of service recovery — very coherent",
  },
};

/**
 * Look up compatibility between two domains.
 * IDs are sorted alphabetically to ensure deterministic key matching.
 */
export function getDomainCompatibility(
  domainIdA: string,
  domainIdB: string,
): CompatibilityEntry {
  const key = [domainIdA, domainIdB].sort().join(":");
  return (
    EXPLICIT_COMPAT[key] ?? {
      classification: "compatible-with-warning",
      reason:
        "Cross-domain combination — compatible if the same respondent can speak to both from personal experience",
    }
  );
}

/**
 * Check if two domains are from the same family (always compatible).
 */
export function areSameFamily(domainIdA: string, domainIdB: string): boolean {
  const a = SUB_DOMAINS.find((d) => d.id === domainIdA);
  const b = SUB_DOMAINS.find((d) => d.id === domainIdB);
  return !!a && !!b && a.familyId === b.familyId;
}
