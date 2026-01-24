export type SurveyDomainId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SurveyDomain {
  id: SurveyDomainId;
  name: string;
  description: string;
  scope: string;
  personaInstruction: string;
  shadowRequirements: string[];
  examples: string[];
}

export const SURVEY_DOMAINS: Record<SurveyDomainId, SurveyDomain> = {
  1: {
    id: 1,
    name: "Customer Experience & Satisfaction",
    description: "Evaluating a transaction or service that has ALREADY OCCURRED.",
    scope: "Post-interaction feedback. B2C relationship. Focus on satisfaction with a completed event.",
    personaInstruction: "You are a Customer Experience Analyst. Focus on the specific transaction, touchpoint friction, and net promoter score. Use terms like 'User Journey', 'Touchpoint', and 'Satisfaction Score'. Ask about specific moments of truth.",
    shadowRequirements: ["Touchpoint Identification (when did it happen?)", "Transaction Type", "Customer Segment"],
    examples: ["Post-purchase feedback", "Support ticket follow-up", "Hotel stay review"]
  },
  2: {
    id: 2,
    name: "Market Research & Consumer Intelligence",
    description: "Understanding markets, preferences, and behaviors to inform FUTURE decisions.",
    scope: "Pre-decision exploration. About possibilities, not past experiences. Testing concepts and drivers.",
    personaInstruction: "You are a Market Researcher. Adopt an exploratory, neutral tone. Focus on 'Wants', 'Needs', 'Price Sensitivity', and 'Brand Perception'. Avoid assuming they are current users. Use 'Concept Testing' and 'Purchase Intent' frameworks.",
    shadowRequirements: ["Target Demographics", "Competitor Awareness", "Price/Value Perception"],
    examples: ["Concept testing", "Brand awareness", "Pricing research"]
  },
  3: {
    id: 3,
    name: "Workforce & Organizational Development",
    description: "Assessing internal health, effectiveness, and employee sentiment.",
    scope: "Employer-employee relationship. Confidential, internal focus on culture and engagement.",
    personaInstruction: "You are an Organizational Psychologist. PRIORITIZE ANONYMITY AND PSYCHOLOGICAL SAFETY. Use empathetic, professional language. Focus on 'Engagement', 'Culture', and 'Management Support'. Be extremely sensitive to power dynamics.",
    shadowRequirements: ["Anonymity Guarantee", "Department/Team Scope", "Tenure/Role context"],
    examples: ["Employee engagement", "360 feedback", "Onboarding experience"]
  },
  4: {
    id: 4,
    name: "Health & Clinical Assessment",
    description: "Evaluating health status, treatment outcomes, or medical service quality.",
    scope: "Physical/Mental health. HIPAA/Privacy critical. Clinical sensitivity required.",
    personaInstruction: "You are a Clinical Research Coordinator. Use a GENTLE, NON-JUDGMENTAL, and CLINICAL tone. Prioritize patient privacy and comfort. Use terms like 'Symptoms', 'Outcomes', and 'Quality of Life'. Validate feelings but maintain professional boundaries.",
    shadowRequirements: ["Condition/Symptom focus", "Privacy Level (PHI)", "Patient Cohort definition"],
    examples: ["Patient satisfaction", "Symptom tracking", "Mental health screening (PHQ-9)"]
  },
  5: {
    id: 5,
    name: "Education & Learning Assessment",
    description: "Measuring knowledge, skills, learning outcomes, or educational experiences.",
    scope: "Educator-learner relationship. Testing knowledge or evaluating pedagogy.",
    personaInstruction: "You are an Educational Evaluator. Focus on 'Learning Outcomes', 'Curriculum Effectiveness', and 'Student Engagement'. Use academic but accessible language. Distinguish between 'Testing Knowledge' and 'Evaluating Experience'.",
    shadowRequirements: ["Course/Program Context", "Learning Objectives", "Instructor/Methodology focus"],
    examples: ["Course evaluation", "Training feedback", "Knowledge assessment"]
  },
  6: {
    id: 6,
    name: "Civic Engagement & Public Opinion",
    description: "Capturing citizen views on political matters, policy, or community governance.",
    scope: "Citizen-Government relationship. Measuring opinion, voting intent, and community priorities.",
    personaInstruction: "You are a Public Opinion Pollster. Maintain STRICT NEUTRALITY and objectivity. Avoid leading questions. Focus on 'Policy Preferences', 'Community Priorities', and 'Civic Participation'. Ensure questions cover diverse viewpoints.",
    shadowRequirements: ["Geographic Scope", "Policy/Issue Specifics", "Voter/Resident Status"],
    examples: ["Political polling", "Community feedback", "Policy opinion"]
  },
  7: {
    id: 7,
    name: "Scientific & Academic Research",
    description: "Advancing theoretical knowledge testing hypotheses.",
    scope: "Research questions, theory testing, experimental conditions. IRB context.",
    personaInstruction: "You are an Academic Researcher. Focus on METHODOLOGICAL RIGOR and removing bias. Use terms like 'Hypothesis', 'Variable', and 'Control'. Ensure questions distinguish between correlation and causation contexts.",
    shadowRequirements: ["Hypothesis to test", "Control variables", "Theoretical framework"],
    examples: ["Psychology experiment", "Sociology study", "Behavioral research"]
  },
  8: {
    id: 8,
    name: "Regulatory Compliance & Risk Management",
    description: "Verifying adherence to laws, regulations, standards, or safety.",
    scope: "Audits, inspections, legal compliance. Formal, precise, documentation-heavy.",
    personaInstruction: "You are a Compliance Officer. Use a FORMAL, PRECISE, and AUDIT-FOCUSED tone. Focus on 'Adherence', 'Gaps', 'Safety Standards', and 'Risk'. Questions must be unambiguous and factual.",
    shadowRequirements: ["Regulation/Standard (e.g. OSHA, GDPR)", "Audit Trail needs", "Risk Severity"],
    examples: ["Safety audit", "GDPR compliance", "Internal risk assessment"]
  },
  9: {
    id: 9,
    name: "Demographic & Social Characterization",
    description: "Counting, describing, and understanding population profiles.",
    scope: "Factual characteristics: age, income, lifestyle. Census-style.",
    personaInstruction: "You are a Demographer. Focus on FACTUAL ACCURACY and STATISTICAL categorization. Use neutral, standard demographic categories. Avoid opinion questions; focus on 'Characteristics', 'Household Composition', and 'Trends'.",
    shadowRequirements: ["Demographic Categories", "Geographic Granularity", "Timeframe (snapshot vs trend)"],
    examples: ["Census", "Household survey", "Income study"]
  },
  10: {
    id: 10,
    name: "Infrastructure & Systems Performance",
    description: "Evaluating how physical systems or technical platforms are functioning.",
    scope: "Performance, usability, condition of systems (digital or physical).",
    personaInstruction: "You are a Systems Analyst. Focus on FUNCTIONALITY, USABILITY, and PERFORMANCE. Distinguish between 'User Error' and 'System Failure'. Use terms like 'Uptime', 'Usability', 'Bug', and 'Feature Flow'.",
    shadowRequirements: ["System/Platform ID", "Specific Outcome (Speed, Error, Ease)", "User Context"],
    examples: ["Website usability", "Public transport feedback", "App crash report"]
  }
};

export function getDomainById(id: number): SurveyDomain | undefined {
  return SURVEY_DOMAINS[id as SurveyDomainId];
}

export function getAllDomains(): SurveyDomain[] {
  return Object.values(SURVEY_DOMAINS);
}
