import { ingestKnowledge, type KnowledgeEntry } from "../lib/rag/ingest";
import { nanoid } from "nanoid";

const SITUATIONAL_CURATIONS: KnowledgeEntry[] = [
  // --- FAMILY 1: CUSTOMER EXPERIENCE ---
  {
    domainId: 1,
    category: "pattern",
    title: "Archetype: The Loyal Advocate",
    content: "CHARACTERISTICS: High NPS (9-10), long-term history, frequent positive social signals.\nHANDLING: Shift from 'problem solving' to 'co-creation'. Ask about the future of the product, new features they want, and why they recommend it to others. Avoid basic satisfaction questions; they are past that.",
    metadata: { family: "Customer Experience", type: "archetype" }
  },
  {
    domainId: 1,
    category: "technique",
    title: "Fragment: Probing Discretely on Detraction",
    content: "CONTEXT: Respondent gives a low score but is vague about the reason.\nAGENT: 'I hear that the experience hasn't met your expectations recently. If you could pinpoint one moment where we lost your trust, what would that look like?'\nRESULT: Forces a situational anchor instead of generic frustration.",
    metadata: { family: "Customer Experience", type: "fragment" }
  },
  {
    domainId: 1,
    category: "general",
    title: "Glossary: CX Terminology",
    content: "NPS: Net Promoter Score. CSAT: Customer Satisfaction. CES: Customer Effort Score. Churn: Rate of customer attrition. Touchpoint: Individual interaction point in the journey.",
    metadata: { family: "Customer Experience", type: "glossary" }
  },

  // --- FAMILY 2: PHYSICAL PRODUCT ---
  {
    domainId: 2,
    category: "pattern",
    title: "Archetype: The Sensory Specialist",
    content: "CHARACTERISTICS: Focus on 'mouthfeel', 'texture', 'scent', and 'finish'.\nHANDLING: Use evocative sensory language. Probe for comparison with existing benchmarks. Ask about the 'moment of truth' during first use.",
    metadata: { family: "Physical Product", type: "archetype" }
  },

  // --- FAMILY 3: DIGITAL PRODUCT ---
  {
    domainId: 3,
    category: "pattern",
    title: "Archetype: The Power User",
    content: "CHARACTERISTICS: Uses advanced features, bypasses tutorials, highly sensitive to latency/efficiency.\nHANDLING: Use technical vocabulary. Probe on 'friction' in workflows and 'time-to-value'. Ask about edge cases they've discovered.",
    metadata: { family: "Digital Product", type: "archetype" }
  },
  {
    domainId: 3,
    category: "technique",
    title: "Fragment: Usability Friction Probe",
    content: "CONTEXT: Respondent pauses or hesitates when describing a UI flow.\nAGENT: 'You hesitated there for a second while describing the navigation. Was there a specific click or step that felt counter-intuitive in that moment?'\nRESULT: Pinpoints exact UI friction points.",
    metadata: { family: "Digital Product", type: "fragment" }
  },

  // --- FAMILY 4: SERVICE ENVIRONMENT ---
  {
    domainId: 4,
    category: "technique",
    title: "Fragment: ATMOSPHERE Reflection",
    content: "CONTEXT: Respondent mentions the 'vibe' or 'mood' of a physical space.\nAGENT: 'You mentioned the atmosphere felt [verbatim]. How did that specific lighting/sound impact your willingness to stay longer or return?'\nRESULT: Links abstract 'vibe' to concrete business metrics.",
    metadata: { family: "Service Environment", type: "fragment" }
  },

  // --- FAMILY 5: MARKET INTELLIGENCE ---
  {
    domainId: 5,
    category: "pattern",
    title: "Archetype: The Category Switcher",
    content: "CHARACTERISTICS: Recently moved from a competitor, sensitive to price/feature deltas.\nHANDLING: Explicitly ask for 'Side-by-Side' comparisons. Probe on what 'pushed' them away from the previous brand and what 'pulled' them here.",
    metadata: { family: "Market Intelligence", type: "archetype" }
  },

  // --- FAMILY 6: WORKFORCE & ORG ---
  {
    domainId: 6,
    category: "pattern",
    title: "Archetype: The Quiet Quitter",
    content: "CHARACTERISTICS: Minimalist answers, low engagement score, focus on 'work-life balance' over 'mission'.\nHANDLING: Emphasize anonymity. Ask about 'barriers to engagement' and 'resource constraints' rather than 'passion' or 'culture' which may trigger defensiveness.",
    metadata: { family: "Workforce & Org", type: "archetype" }
  },
  {
    domainId: 6,
    category: "technique",
    title: "Edge Case: Manager Defensiveness",
    content: "SCENARIO: Respondent (Manager) feels their team's low scores are a personal attack.\nHANDLING: Reframe as 'systemic challenges'. AGENT: 'It sounds like your team is facing significant external pressure. How has that affected your ability to support them in the way you'd like?'",
    metadata: { family: "Workforce & Org", type: "edge_case" }
  },

  // --- FAMILY 7: B2B & PRO SERVICES ---
  {
    domainId: 7,
    category: "pattern",
    title: "Archetype: The Strategic Partner",
    content: "CHARACTERISTICS: High-level stakeholder, focus on 'long-term roadmap' and 'alignment'.\nHANDLING: Avoid operational minutiae. Probe on 'trust', 'transparency', and 'future growth'. Ask about the partnership's impact on their own board-level goals.",
    metadata: { family: "B2B & Professional Services", type: "archetype" }
  },

  // --- FAMILY 8: EDUCATION ---
  {
    domainId: 8,
    category: "technique",
    title: "Fragment: Learning Outcome Probe",
    content: "CONTEXT: Student says they 'liked' the course but is vague on takeaways.\nAGENT: 'It's great you enjoyed the sessions. If you had to teach the single most important concept from last week to a colleague, what would you say?'\nRESULT: Verifies actual knowledge transfer vs. just engagement.",
    metadata: { family: "Education", type: "fragment" }
  },

  // --- FAMILY 9: CIVIC & PUBLIC ---
  {
    domainId: 9,
    category: "pattern",
    title: "Archetype: The Concerned Citizen",
    content: "CHARACTERISTICS: High emotional investment, focus on 'transparency', 'fairness', and 'community impact'.\nHANDLING: Use neutral, respectful tone. Avoid partisan vocabulary. Probe on 'trust' in the process and 'clarity' of communication.",
    metadata: { family: "Civic & Public", type: "archetype" }
  },

  // --- FAMILY 10: SCIENTIFIC RESEARCH ---
  {
    domainId: 10,
    category: "general",
    title: "Glossary: Scientific Rigor",
    content: "P-Value: Statistical significance. Double-Blind: Bias reduction method. Peer Review: Quality control. Methodology: System of methods used.",
    metadata: { family: "Scientific Research", type: "glossary" }
  },

  // --- FAMILY 11: MEDIA & ENT ---
  {
    domainId: 11,
    category: "pattern",
    title: "Archetype: The Binge Watcher",
    content: "CHARACTERISTICS: Consumes large amounts of content quickly, sensitive to 'flow' and 'recommendations'.\nHANDLING: Ask about 'discovery' and 'fatigue'. Probe on why they stopped a specific series or what kept them 'hooked'.",
    metadata: { family: "Media & Entertainment", type: "archetype" }
  },

  // --- FAMILY 12: BUILT ENVIRONMENT ---
  {
    domainId: 12,
    category: "technique",
    title: "Fragment: Workplace Utilization Probe",
    content: "CONTEXT: Employee mentions they 'don't use the office much'.\nAGENT: 'When you do choose to come in, what is the one thing the office provides that your home setup doesn't? Is it social, technical, or environmental?'\nRESULT: Identifies the unique value proposition of the physical workplace.",
    metadata: { family: "Built Environment", type: "fragment" }
  },

  // --- FAMILY 13: FINANCIAL & LEGAL ---
  {
    domainId: 13,
    category: "pattern",
    title: "Archetype: The Risk-Averse Investor",
    content: "CHARACTERISTICS: Focus on 'protection' and 'worst-case scenarios', skeptical of high returns.\nHANDLING: Use vocabulary of 'security', 'compliance', and 'stability'. Avoid aggressive growth language. Probe on the 'emotional weight' of loss.",
    metadata: { family: "Financial & Legal", type: "archetype" }
  },
  {
    domainId: 13,
    category: "general",
    title: "Glossary: Financial Compliance",
    content: "KYC: Know Your Customer. AML: Anti-Money Laundering. Fiduciary: Duty to act in the best interest of the client. Asset Allocation: Distribution of investments across categories.",
    metadata: { family: "Financial & Legal", type: "glossary" }
  }
];

async function seedKnowledgeBase() {
  console.log(`[Seed] Starting knowledge base seeding with ${SITUATIONAL_CURATIONS.length} entries...`);
  
  for (const entry of SITUATIONAL_CURATIONS) {
    try {
      await ingestKnowledge(entry);
      console.log(`[Seed] Successfully ingested: ${entry.title}`);
    } catch (error) {
      console.error(`[Seed] Failed to ingest ${entry.title}:`, error);
    }
  }
  
  console.log("[Seed] Completed seeding.");
}

seedKnowledgeBase().catch(console.error);
