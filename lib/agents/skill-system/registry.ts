
import { SubDomain, DOMAIN_FAMILIES } from "./types";

export const SUB_DOMAINS: SubDomain[] = [
  // Family 1: Customer Experience
  {
    id: "cx-nps-loyalty",
    familyId: 1,
    name: "NPS & Customer Loyalty",
    description: "Long-term brand relationship and loyalty research.",
    triggerKeywords: ["nps", "loyalty", "brand advocacy", "recurring", "relationship health"]
  },
  {
    id: "cx-post-transaction",
    familyId: 1,
    name: "Post-Transaction Research",
    description: "Discrete journey mapping for recent purchases or interactions.",
    triggerKeywords: ["purchase", "checkout", "delivery", "transactional", "order", "visit"]
  },
  {
    id: "cx-service-recovery",
    familyId: 1,
    name: "Service Recovery Research",
    description: "Psychology of complaint resolution and trust rebuilding.",
    triggerKeywords: ["complaint", "support ticket", "resolution", "recovery", "problem", "issue"]
  },
  {
    id: "cx-client-relationship",
    familyId: 1,
    name: "Client Relationship Research",
    description: "High-value B2B/Personal account relationship quality.",
    triggerKeywords: ["account manager", "consultancy", "professional services", "partnership"]
  },
  {
    id: "cx-onboarding",
    familyId: 1,
    name: "Onboarding Experience",
    description: "First 30-90 day adoption and time-to-value analysis.",
    triggerKeywords: ["onboarding", "new user", "activation", "getting started", "setup"]
  },

  // Family 2: Physical Product
  {
    id: "pp-sensory-evaluation",
    familyId: 2,
    name: "Sensory & Product Evaluation",
    description: "Physical sensory research (taste, scent, texture).",
    triggerKeywords: ["sensory", "taste test", "scent", "fragrance", "texture", "mouthfeel", "unboxing"]
  },
  {
    id: "pp-usage-performance",
    familyId: 2,
    name: "Usage & Performance Research",
    description: "Long-term utility and durability research.",
    triggerKeywords: ["durability", "home use", "wear and tear", "utility", "ergonomics", "long-term use"]
  },
  {
    id: "pp-packaging-presentation",
    familyId: 2,
    name: "Packaging & Presentation",
    description: "Physical packaging and shelf perception research.",
    triggerKeywords: ["packaging", "label", "unboxing", "shelf impact", "branding", "pack design"]
  },
  {
    id: "pp-physical-concept-testing",
    familyId: 2,
    name: "Physical Concept Testing",
    description: "New physical product concept validation.",
    triggerKeywords: ["product concept", "new product", "innovation", "prototype", "concept test"]
  },
  {
    id: "pp-durability-materials",
    familyId: 2,
    name: "Durability & Materials",
    description: "Perception of build quality and material longevity.",
    triggerKeywords: ["build quality", "materials", "robustness", "longevity", "sturdy", "quality feel"]
  },

  // Family 3: Digital Product
  {
    id: "dp-software-experience",
    familyId: 3,
    name: "Software Experience Research",
    description: "Daily usage and accumulated experience with a digital product.",
    triggerKeywords: ["software experience", "daily use", "friction", "jtbd", "jobs to be done", "workflow fit"]
  },
  {
    id: "dp-usability-ux",
    familyId: 3,
    name: "Usability & UX Research",
    description: "Software usability and interface experience.",
    triggerKeywords: ["usability", "ux", "ui", "interface", "navigation", "checkout flow", "app experience"]
  },
  {
    id: "dp-adoption-feature",
    familyId: 3,
    name: "Feature Adoption & Value",
    description: "New feature adoption and problem-solution fit.",
    triggerKeywords: ["adoption", "feature", "new feature", "activation", "value moment", "aha moment"]
  },
  {
    id: "dp-technology-adoption",
    familyId: 3,
    name: "Technology Adoption",
    description: "Barriers and drivers for new technology rollout.",
    triggerKeywords: ["tech adoption", "transformation", "resistance", "learning curve", "migration", "rollout"]
  },
  {
    id: "dp-platform-ecosystem",
    familyId: 3,
    name: "Platform & Ecosystem",
    description: "Developer and partner experience with APIs/platforms.",
    triggerKeywords: ["api", "developer experience", "ecosystem", "partner", "integration", "platform health"]
  },

  // Family 5: Market Intelligence
  {
    id: "mi-needs-behavior",
    familyId: 5,
    name: "Consumer Needs & Behavior",
    description: "Motivations, habits, and underlying drivers of consumer choice.",
    triggerKeywords: ["needs", "behavior", "motivation", "habits", "ritual", "influences"]
  },
  {
    id: "mi-brand-perception",
    familyId: 5,
    name: "Brand Perception Research",
    description: "Implicit associations and competitive brand positioning.",
    triggerKeywords: ["brand", "perception", "trust", "associations", "competitor", "consideration"]
  },
  {
    id: "mi-pricing-value",
    familyId: 5,
    name: "Pricing & Value Perception",
    description: "Psychological price boundaries and value anchors.",
    triggerKeywords: ["pricing", "value", "willingness to pay", "price signals", "worth", "budget"]
  },
  {
    id: "mi-proposition-testing",
    familyId: 5,
    name: "Proposition Testing",
    description: "Validation of new product/service concepts and benefits.",
    triggerKeywords: ["proposition", "concept", "new idea", "message testing", "resonance"]
  },
  {
    id: "mi-market-segmentation",
    familyId: 5,
    name: "Market Segmentation",
    description: "Qualitative depth for human-centered audience grouping.",
    triggerKeywords: ["segmentation", "sub-groups", "profiles", "target audience", "diversity"]
  },
  {
    id: "mi-trend-behavior",
    familyId: 5,
    name: "Trend & Emerging Behavior",
    description: "Early signals and leading-edge consumer shifts.",
    triggerKeywords: ["trend", "emerging", "future", "early adopter", "shifting behavior", "innovation"]
  },

  // Family 6: Workforce & Organization
  {
    id: "wo-employee-engagement",
    familyId: 6,
    name: "Employee Engagement",
    description: "Psychological relationship with work and team.",
    triggerKeywords: ["engagement", "pulse", "morale", "work culture", "satisfaction", "employee experience"]
  },
  {
    id: "wo-360-feedback",
    familyId: 6,
    name: "360-Degree Feedback",
    description: "Multi-rater feedback for individual growth and performance.",
    triggerKeywords: ["360 feedback", "peer review", "manager review", "self-assessment", "competency"]
  },
  {
    id: "wo-exit-departure",
    familyId: 6,
    name: "Exit & Departure Research",
    description: "Understanding drivers of attrition and final employee sentiment.",
    triggerKeywords: ["exit interview", "resignation", "attrition", "turnover", "departure"]
  },
  {
    id: "wo-culture-assessment",
    familyId: 6,
    name: "Culture & Values Assessment",
    description: "Measuring lived company values and organizational norms.",
    triggerKeywords: ["company culture", "values", "norms", "alignment", "integrity", "collaboration"]
  },
  {
    id: "wo-dei-experience",
    familyId: 6,
    name: "DEI Experience Research",
    description: "Perception of diversity, equity, and inclusion in the workplace.",
    triggerKeywords: ["dei", "inclusion", "equity", "diversity", "belonging", "bias"]
  },
  {
    id: "wo-manager-effectiveness",
    familyId: 6,
    name: "Manager Effectiveness",
    description: "Direct supervisor impact and leadership quality.",
    triggerKeywords: ["manager", "leadership", "supervision", "coaching", "direction", "support"]
  },

  // Family 7: B2B & Professional Services
  {
    id: "b2b-partnership-health",
    familyId: 7,
    name: "B2B Partnership Health",
    description: "Long-term business-to-business relationship quality.",
    triggerKeywords: ["partnership", "account health", "strategic alignment", "b2b", "professional services", "procurement"]
  },
  {
    id: "b2b-vendor-evaluation",
    familyId: 7,
    name: "Vendor & Supplier Evaluation",
    description: "Performance and reliability of B2B service providers.",
    triggerKeywords: ["vendor", "supplier", "rfp", "service provider", "reliability", "contract"]
  },
  {
    id: "b2b-buying-process",
    familyId: 7,
    name: "B2B Buying Process",
    description: "Complex procurement journeys and decision-making units.",
    triggerKeywords: ["procurement", "buying center", "decision makers", "purchase journey", "b2b sales"]
  },
  {
    id: "b2b-partnership-reseller",
    familyId: 7,
    name: "Reseller & Partner Research",
    description: "Relationship with distributors and indirect channel partners.",
    triggerKeywords: ["reseller", "distributor", "channel partner", "vadr", "indirect sales"]
  },
  {
    id: "b2b-service-delivery",
    familyId: 7,
    name: "B2B Service Delivery",
    description: "Customer experience during professional service projects.",
    triggerKeywords: ["project delivery", "implementation", "consulting", "service quality", "on-time"]
  },

  // Family 8: Education & Learning
  {
    id: "el-course-efficacy",
    familyId: 8,
    name: "Course Evaluation & Efficacy",
    description: "Pedagogical effectiveness and student experience research.",
    triggerKeywords: ["education", "course", "learning", "student", "mastery", "curriculum", "training"]
  },
  {
    id: "el-learning-outcome",
    familyId: 8,
    name: "Learning Outcome Research",
    description: "Behavioral change and knowledge retention post-learning.",
    triggerKeywords: ["knowledge retention", "behavioral change", "skill transfer", "learning outcome", "application"]
  },
  {
    id: "el-institutional-experience",
    familyId: 8,
    name: "Institutional Experience",
    description: "Broader student environment and support services.",
    triggerKeywords: ["university", "school", "administration", "student services", "belonging", "campus"]
  },
  {
    id: "el-professional-development",
    familyId: 8,
    name: "Professional Development",
    description: "Workplace learning and employer-supported growth.",
    triggerKeywords: ["mentorship", "career growth", "training program", "l&d", "professional development"]
  },

  // Family 9: Civic & Public
  {
    id: "cp-citizen-service",
    familyId: 9,
    name: "Citizen Service Experience",
    description: "Public service accessibility and satisfaction level research.",
    triggerKeywords: ["government", "public service", "citizen", "council", "municipality", "accessibility"]
  },
  {
    id: "cp-community-trust",
    familyId: 9,
    name: "Community Trust & Safety",
    description: "Trust in local government and institutional safety perception.",
    triggerKeywords: ["trust", "safety", "policing", "governance", "institutional trust", "transparency"]
  },
  {
    id: "cp-policy-perception",
    familyId: 9,
    name: "Policy Perception & Impact",
    description: "Understanding and sentiment toward new policies or regulations.",
    triggerKeywords: ["policy", "regulation", "law", "compliance", "public opinion", "impact assessment"]
  },
  {
    id: "cp-voter-sentiment",
    familyId: 9,
    name: "Voter Sentiment & Participation",
    description: "Drivers of democratic participation and civic engagement.",
    triggerKeywords: ["voter", "election", "democracy", "civic engagement", "political sentiment"]
  },

  // Family 10: Scientific Research
  {
    id: "sr-formal-methodology",
    familyId: 10,
    name: "Formal Methodology",
    description: "Academic and scientific research methodology.",
    triggerKeywords: ["scientific", "academic", "methodology", "research", "study", "experiment", "formal"]
  },
  {
    id: "sr-clinical-trial",
    familyId: 10,
    name: "Clinical Trial Experience",
    description: "Participant experience and ethics in clinical studies.",
    triggerKeywords: ["clinical trial", "pharma", "patient experience", "ethics", "medical study", "drug trial"]
  },
  {
    id: "sr-rd-ethics",
    familyId: 10,
    name: "R&D Ethics & Perception",
    description: "Perception of ethics, safety, and transparency in new innovation.",
    triggerKeywords: ["ethics", "innovation", "r&d", "safety", "trust in science", "transparency"]
  },

  // Family 4: Service Environment (Example Seed)
  {
    id: "se-dining-restaurant",
    familyId: 4,
    name: "Dining & Restaurant Research",
    description: "Holistic experience across food, service, and ambiance.",
    triggerKeywords: ["dining", "restaurant", "food quality", "server", "menu", "cafe", "eatery"]
  },
  {
    id: "se-hospitality-experience",
    familyId: 4,
    name: "Hospitality Experience",
    description: "Guest journey at hotels, resorts, and stays.",
    triggerKeywords: ["hotel", "resort", "stay", "guest", "check-in", "hospitality", "room service", "booking"]
  },
  {
    id: "se-retail-instore",
    familyId: 4,
    name: "Retail & In-Store Experience",
    description: "Physical shopping experience and spatial journey.",
    triggerKeywords: ["retail", "store", "shopping", "in-store", "shelf", "checkout", "product discovery", "staff"]
  },
  {
    id: "se-personal-care",
    familyId: 4,
    name: "Personal Care & Wellness",
    description: "Experience of salons, spas, gyms, and clinics.",
    triggerKeywords: ["salon", "spa", "gym", "wellness", "fitness", "personal care", "treatment", "practitioner"]
  },
  {
    id: "se-transportation-mobility",
    familyId: 4,
    name: "Transportation & Mobility",
    description: "Point-to-point journey experience across transport modes.",
    triggerKeywords: ["transportation", "airline", "train", "bus", "mobility", "shuttle", "journey", "reliability"]
  },
  {
    id: "se-event-live",
    familyId: 4,
    name: "Event & Live Experience",
    description: "Experience of concerts, games, and live shows.",
    triggerKeywords: ["event", "concert", "sports", "festival", "live", "show", "venue", "ticketing"]
  },

  // Family 12: Built Environment
  {
    id: "be-workplace-utilization",
    familyId: 12,
    name: "Workplace & Office Environment",
    description: "Occupancy, hybrid flow, and office experience research.",
    triggerKeywords: ["office", "workplace", "desk", "meeting room", "facilities", "hybrid", "utilization"]
  },
  {
    id: "be-residential-tenant",
    familyId: 12,
    name: "Residential & Tenant Experience",
    description: "Apartment living, amenities, and property management quality.",
    triggerKeywords: ["tenant", "apartment", "residential", "housing", "rent", "property manager", "amenities"]
  },
  {
    id: "be-community-neighborhood",
    familyId: 12,
    name: "Community & Neighborhood Research",
    description: "Urban design, social cohesion, and local amenity perception.",
    triggerKeywords: ["neighborhood", "community", "public space", "local area", "social cohesion", "safety"]
  },

  // Family 11: Media & Entertainment
  {
    id: "me-content-resonance",
    familyId: 11,
    name: "Content Resonance & Storytelling",
    description: "Emotional impact and narrative engagement with media content.",
    triggerKeywords: ["storytelling", "content", "narrative", "emotional impact", "media", "show", "film"]
  },
  {
    id: "me-streaming-experience",
    familyId: 11,
    name: "Streaming & Platform Experience",
    description: "Usability and value perception of digital media platforms.",
    triggerKeywords: ["streaming", "platform", "media app", "ott", "subscription", "discovery"]
  },
  {
    id: "me-gaming-engagement",
    familyId: 11,
    name: "Gaming Engagement & Motivation",
    description: "Player motivation and satisfaction with gaming loops.",
    triggerKeywords: ["gaming", "player", "gameplay", "mechanics", "motivation", "game loop"]
  },
  {
    id: "me-audience-fragmentation",
    familyId: 11,
    name: "Audience Segmentation & Habits",
    description: "Shifting media habits across multiple channels.",
    triggerKeywords: ["media habits", "multi-channel", "audience", "fragmentation", "consumption"]
  },

  // Family 13: Financial & Legal
  {
    id: "fn-banking-trust",
    familyId: 13,
    name: "Banking & Financial Trust",
    description: "Reliability, security, and institutional trust in finance.",
    triggerKeywords: ["banking", "finance", "trust", "security", "fraud", "reliability", "financial services"]
  },
  {
    id: "fn-investment-behavior",
    familyId: 13,
    name: "Investment Behavior & Risk",
    description: "Drivers of risk-taking, asset allocation, and wealth management.",
    triggerKeywords: ["investment", "risk", "wealth management", "portfolio", "trading", "financial planning"]
  },
  {
    id: "fn-insurance-claims",
    familyId: 13,
    name: "Insurance & Recovery Experience",
    description: "Experience of the claims process and recovery satisfaction.",
    triggerKeywords: ["insurance", "claims", "payout", "recovery", "protection", "policy"]
  },
  {
    id: "fn-legal-access",
    familyId: 13,
    name: "Legal Service Access",
    description: "Barriers and experience of legal service delivery and advice.",
    triggerKeywords: ["legal", "lawyer", "advice", "access to justice", "contracts", "professional advice"]
  },
  

];

export function getFamilyById(id: number) {
  return DOMAIN_FAMILIES.find(f => f.id === id);
}

export function getSubDomainById(id: string) {
  return SUB_DOMAINS.find(s => s.id === id);
}

export function matchHybridSubDomains(query: string): { subDomain: SubDomain; weight: number }[] {
  const q = query.toLowerCase();
  const matches: { subDomain: SubDomain; score: number }[] = [];

  for (const sd of SUB_DOMAINS) {
    const score = sd.triggerKeywords.filter(k => q.includes(k)).length;
    if (score > 0) {
      matches.push({ subDomain: sd, score });
    }
  }

  if (matches.length === 0) return [];

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  const maxScore = matches[0].score;
  const result = matches
    .filter(m => m.score >= maxScore * 0.5) // Only take matches within 50% of the top score
    .slice(0, 3) // Limit to top 3
    .map(m => ({
      subDomain: m.subDomain,
      weight: m.score / maxScore, // Normalize weight relative to the top match
    }));

  return result;
}

export function matchSubDomain(query: string): SubDomain | null {
  const results = matchHybridSubDomains(query);
  return results.length > 0 ? results[0].subDomain : null;
}
