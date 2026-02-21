export interface DomainManifest {
  id: number;
  name: string;

  // Level 1: Core skills — always loaded when domain is identified
  // Separate skill IDs for each agent phase
  coreSkills: {
    creation: string[]; // Skill IDs (filenames without .md) for creation phase
    conducting: string[]; // Skill IDs for conducting phase
    analytics: string[]; // Skill IDs for analytics phase
  };

  // Level 2: Survey-type skills — loaded when survey type is identified
  // Each entry has triggers (natural language patterns) and the skills to load
  surveyTypeSkills: Array<{
    surveyType: string; // Human-readable name, e.g. "Post-Purchase Feedback"
    trigger: string[]; // Keywords/phrases that identify this type
    skills: {
      creation?: string[]; // Optional — not all types need different creation
      conducting?: string[]; // Usually the most important differentiation
      analytics?: string[];
    };
  }>;

  // Level 3 overrides: Domain-specific situational skills
  // These supplement the global situational skills defined in SKILL_TRIGGERS
  domainSituationalSkills?: Array<{
    trigger: string[];
    skillId: string;
  }>;
}

// ============================================================================
// DOMAIN MANIFESTS
// Add new domains here. No other file needs to change when adding a domain.
// ============================================================================

export const DOMAIN_MANIFESTS: Record<number, DomainManifest> = {
  // --------------------------------------------------------------------------
  // Domain 1: Customer Experience & Satisfaction
  // --------------------------------------------------------------------------
  1: {
    id: 1,
    name: "Customer Experience & Satisfaction",
    coreSkills: {
      creation: ["cx-creation-core"],
      conducting: ["cx-conducting-core"],
      analytics: ["cx-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Post-Purchase Feedback",
        trigger: [
          "post-purchase",
          "after buying",
          "after ordering",
          "just bought",
          "recent purchase",
          "checkout",
          "order confirmation",
          "transactional",
        ],
        skills: {
          // Instructions merged into cx-conducting-core
        },
      },
      {
        surveyType: "Support Resolution",
        trigger: [
          "support",
          "help desk",
          "customer service",
          "issue",
          "resolution",
          "ticket",
          "complaint",
          "problem resolved",
          "after support",
        ],
        skills: {
          // Instructions merged into cx-conducting-core
        },
      },
      {
        surveyType: "Relationship / NPS",
        trigger: [
          "nps",
          "net promoter",
          "loyalty",
          "recommend",
          "annual",
          "quarterly",
          "relationship",
          "brand health",
          "overall experience",
        ],
        skills: {
          // Instructions merged into cx-creation-core and cx-conducting-core
        },
      },
      {
        surveyType: "Onboarding Experience",
        trigger: [
          "onboarding",
          "new user",
          "first time",
          "getting started",
          "setup",
          "activation",
          "first week",
          "new customer",
        ],
        skills: {
          // Instructions merged into cx-conducting-core
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 2: Market Research & Consumer Intelligence
  // --------------------------------------------------------------------------
  2: {
    id: 2,
    name: "Market Research & Consumer Intelligence",
    coreSkills: {
      creation: ["market-research-creation-core"],
      conducting: ["market-research-conducting-core"],
      analytics: ["market-research-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Concept Testing",
        trigger: [
          "concept test",
          "new product",
          "new feature",
          "prototype",
          "would they buy",
          "go no-go",
          "product idea",
          "validate",
        ],
        skills: {
          // Instructions merged into market-research-creation-core and market-research-conducting-core
        },
      },
      {
        surveyType: "Pricing Research",
        trigger: [
          "pricing",
          "willingness to pay",
          "wtp",
          "price sensitivity",
          "how much would they pay",
          "price point",
          "van westendorp",
        ],
        skills: {
          // Instructions merged into market-research-conducting-core
        },
      },
      {
        surveyType: "Competitive Analysis",
        trigger: [
          "competitor",
          "competitive",
          "vs ",
          "comparison",
          "switching",
          "why they chose",
          "alternative",
          "market position",
        ],
        skills: {
          // Instructions merged into market-research-conducting-core
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 3: Workforce & Organizational Development
  // --------------------------------------------------------------------------
  3: {
    id: 3,
    name: "Workforce & Organizational Development",
    coreSkills: {
      // Anonymity and psychological safety instructions are in the core skill
      // and apply to ALL workforce surveys without exception
      creation: ["workforce-creation-core"],
      conducting: ["workforce-conducting-core"],
      analytics: ["workforce-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Employee Engagement / Pulse",
        trigger: [
          "engagement",
          "pulse",
          "gallup",
          "enps",
          "employee satisfaction",
          "how happy",
          "morale",
          "work environment",
        ],
        skills: {
          // Instructions merged into workforce-conducting-core
        },
      },
      {
        surveyType: "360 Degree Feedback",
        trigger: [
          "360",
          "peer review",
          "manager feedback",
          "performance review",
          "multi-rater",
          "developmental feedback",
          "upward feedback",
        ],
        skills: {
          // Instructions merged into workforce-creation-core and workforce-conducting-core
        },
      },
      {
        surveyType: "Exit Interview",
        trigger: [
          "exit",
          "leaving",
          "resigned",
          "resignation",
          "offboarding",
          "why they left",
          "turnover",
          "attrition",
        ],
        skills: {
          // Instructions merged into workforce-conducting-core
        },
      },
      {
        surveyType: "DEI Assessment",
        trigger: [
          "dei",
          "diversity",
          "equity",
          "inclusion",
          "belonging",
          "discrimination",
          "bias",
          "representation",
        ],
        skills: {
          // Instructions merged into workforce-creation-core and workforce-conducting-core
        },
      },
    ],
    domainSituationalSkills: [
      {
        // Specific to workforce: when participant mentions fear or retaliation
        trigger: [
          "afraid",
          "scared",
          "worried",
          "retaliation",
          "fired",
          "consequences",
        ],
        skillId: "workforce-safety-reinforcement",
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 5: Education & Learning Assessment
  // --------------------------------------------------------------------------
  5: {
    id: 5,
    name: "Education & Learning Assessment",
    coreSkills: {
      creation: ["education-creation-core"],
      conducting: ["education-conducting-core"],
      analytics: ["education-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Course Evaluation",
        trigger: [
          "course evaluation",
          "teaching quality",
          "instructor feedback",
          "rate the course",
          "end of course",
          "student feedback on teaching",
        ],
        skills: {
          // Instructions merged into education-conducting-core
        },
      },
      {
        surveyType: "Learning Outcomes Assessment",
        trigger: [
          "learning outcomes",
          "did they learn",
          "knowledge check",
          "skill assessment",
          "competency",
          "bloom's",
          "what did they retain",
        ],
        skills: {
          // Instructions merged into education-creation-core and education-conducting-core
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 6: Civic Engagement & Public Opinion
  // --------------------------------------------------------------------------
  6: {
    id: 6,
    name: "Civic Engagement & Public Opinion",
    coreSkills: {
      // Neutrality rules are CRITICAL and belong in core — every civic survey
      creation: ["civic-creation-core"],
      conducting: ["civic-conducting-core"],
      analytics: ["civic-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Political Polling",
        trigger: [
          "voting",
          "election",
          "candidate",
          "political party",
          "ballot",
          "approve disapprove",
          "presidential",
          "approval rating",
        ],
        skills: {
          // Instructions merged into civic-creation-core and civic-conducting-core
        },
      },
      {
        surveyType: "Community Feedback",
        trigger: [
          "community",
          "neighborhood",
          "local government",
          "city",
          "municipality",
          "public services",
          "town hall",
          "residents",
        ],
        skills: {
          // Instructions merged into civic-conducting-core
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 7: Scientific & Academic Research
  // --------------------------------------------------------------------------
  7: {
    id: 7,
    name: "Scientific & Academic Research",
    coreSkills: {
      creation: ["academic-creation-core"],
      conducting: ["academic-conducting-core"],
      analytics: ["academic-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Experimental Study",
        trigger: [
          "experiment",
          "hypothesis",
          "control group",
          "treatment",
          "randomized",
          "irb",
          "manipulation check",
          "independent variable",
        ],
        skills: {
          // Instructions merged into academic-creation-core and academic-conducting-core
        },
      },
      {
        surveyType: "Scale Validation",
        trigger: [
          "scale validation",
          "psychometric",
          "reliability",
          "cronbach",
          "factor analysis",
          "construct validity",
          "new measure",
        ],
        skills: {
          // Instructions merged into academic-creation-core
        },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Domain 9: Demographic & Social Characterization
  // --------------------------------------------------------------------------
  9: {
    id: 9,
    name: "Demographic & Social Characterization",
    coreSkills: {
      creation: ["demographic-creation-core"],
      conducting: ["demographic-conducting-core"],
      analytics: ["demographic-analytics-core"],
    },
    surveyTypeSkills: [], // Demographics core is comprehensive; types are rare
  },

  // --------------------------------------------------------------------------
  // Domain 10: Infrastructure & Systems Performance
  // --------------------------------------------------------------------------
  10: {
    id: 10,
    name: "Infrastructure & Systems Performance",
    coreSkills: {
      creation: ["infra-creation-core"],
      conducting: ["infra-conducting-core"],
      analytics: ["infra-analytics-core"],
    },
    surveyTypeSkills: [
      {
        surveyType: "Incident Post-Mortem",
        trigger: [
          "post-mortem",
          "incident",
          "outage",
          "downtime",
          "what went wrong",
          "root cause",
          "after the incident",
        ],
        skills: {
          // Instructions merged into infra-conducting-core
        },
      },
      {
        surveyType: "Usability Testing",
        trigger: [
          "usability",
          "user testing",
          "uat",
          "can they use it",
          "task completion",
          "sus score",
          "system usability",
        ],
        skills: {
          // Instructions merged into infra-conducting-core
        },
      },
    ],
  },
};

// ============================================================================
// PUBLIC API
// Replaces all exported functions from domain-expertise-loader.ts
// ============================================================================

export function getDomainManifest(domainId: number): DomainManifest | null {
  return DOMAIN_MANIFESTS[domainId] ?? null;
}

/**
 * Match a survey description against survey type triggers.
 * Returns the matching survey type entry or null if no match.
 * Uses simple keyword scoring — no LLM call required.
 */
export function matchSurveyType(
  manifest: DomainManifest,
  surveyDescription: string,
): DomainManifest["surveyTypeSkills"][0] | null {
  const description = surveyDescription.toLowerCase();

  let bestMatch: DomainManifest["surveyTypeSkills"][0] | null = null;
  let bestScore = 0;

  for (const typeEntry of manifest.surveyTypeSkills) {
    const score = typeEntry.trigger.filter((t) =>
      description.includes(t),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = typeEntry;
    }
  }

  // Require at least one trigger match
  return bestScore > 0 ? bestMatch : null;
}
