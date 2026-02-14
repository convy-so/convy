

/**
 * Domain Expertise System — Three-Expert Architecture
 * 
 * This module provides structured access to domain-specific survey methodology
 * expertise through three interconnected specialist roles:
 * 
 * 1. CREATION EXPERT — Guides AI during survey design to collect all info
 *    the conducting expert needs for high-quality interviews.
 * 2. CONDUCTING EXPERT — Guides AI during live survey conversations with
 *    domain-specific interviewing techniques and interaction patterns.
 * 3. ANALYTICS EXPERT — Guides AI during data analysis with domain-specific
 *    metrics, segmentation strategies, and interpretation frameworks.
 */

// ============================================================================
// Type Definitions — Shared
// ============================================================================

export type SurveyDomainId = 1 | 2 | 3 | 5 | 6 | 7 | 9 | 10;

export interface SurveyDomain {
  id: SurveyDomainId;
  name: string;
  description: string;
  scope: string;
  personaInstruction: string;
  shadowRequirements: string[];
  examples: string[];
}

export interface AntiPattern {
  pattern: string;
  whyBad: string;
  whatToDoInstead: string;
}

export interface QuestionPrinciple {
  principle: string;
  explanation: string;
  goodExample: string;
  badExample: string;
  rationale: string;
}

// ============================================================================
// Type Definitions — Creation Expert
// ============================================================================

export interface CreationStep {
  stepNumber: number;
  title: string;
  description: string;
  guidance: string[];
}

export interface OnboardingQuestion {
  question: string;
  purpose: string;
  options?: string[];
  followUp?: string;
}

export interface DesignDecision {
  decision: string;
  options: string[];
  recommendation: string;
  impact: string;
}

export interface QuestionArchetype {
  name: string;
  whenToUse: string;
  structure: string;
  example: string;
  avoidWith: string;
}

export interface DesignPitfall {
  mistake: string;
  frequency: string;
  consequence: string;
  fix: string;
}

export interface SurveyStructureTemplate {
  idealLength: string;
  openingStrategy: string;
  closingStrategy: string;
  flowPattern: string;
}

export interface CreationExpertise {
  designPhilosophy: string;
  creationProcess: CreationStep[];
  onboardingQuestions: OnboardingQuestion[];
  criticalDesignDecisions: DesignDecision[];
  questionArchetypes: QuestionArchetype[];
  designPitfalls: DesignPitfall[];
  recommendedStructure: SurveyStructureTemplate;
  questionPrinciples: QuestionPrinciple[];
  antiPatterns: AntiPattern[];
}

// ============================================================================
// Type Definitions — Conducting Expert
// ============================================================================

export interface InteractionPattern {
  scenario: string;
  aiGuidance: string;
  example: string;
}

export interface ConductingExpertise {
  interviewerPersona: string;
  interactionPatterns: InteractionPattern[];
  qualityIndicators: string[];
  questionPrinciples: QuestionPrinciple[];
  antiPatterns: AntiPattern[];
}

// ============================================================================
// Type Definitions — Analytics Expert
// ============================================================================

export interface DomainMetric {
  name: string;
  description: string;
  calculation: string;
  benchmark: string;
  actionThreshold: string;
}

export interface SegmentationStrategy {
  dimension: string;
  value: string;
  example: string;
}

export interface SignalNoiseGuide {
  signal: string;
  noise: string;
  howToDistinguish: string;
}

export interface ReportingGuidance {
  audienceFraming: string;
  keyVisualization: string;
  narrativeStructure: string;
  actionableFormat: string;
}

export interface AnalyticsExpertise {
  analysisPhilosophy: string;
  keyMetrics: DomainMetric[];
  segmentationStrategies: SegmentationStrategy[];
  statisticalConsiderations: string[];
  signalVsNoise: SignalNoiseGuide[];
  reportingGuidance: ReportingGuidance;
}

// ============================================================================
// Type Definitions — Composite Domain Expertise
// ============================================================================

export interface DomainExpertise {
  id: SurveyDomainId;
  name: string;
  corePrinciple: string;
  creationExpert: CreationExpertise;
  conductingExpert: ConductingExpertise;
  analyticsExpert: AnalyticsExpertise;
}

// ============================================================================
// Domain Expertise Data
// ============================================================================

export const DOMAIN_EXPERTISE: Record<number, DomainExpertise> = {
  // Domain 1: Customer Experience & Satisfaction
  1: {
    id: 1,
    name: "Customer Experience & Satisfaction",
    corePrinciple: "CX research measures the gap between customer expectations and reality across specific journey touchpoints. It's retrospective, behavioral, and anchored in concrete moments rather than general impressions.",

    creationExpert: {
      designPhilosophy: "A CX survey must be anchored to a specific journey, touchpoint, or transaction. Never design a 'general satisfaction' survey — always ground in concrete moments of truth that disproportionately impact customer loyalty.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Map the Customer Journey",
          description: "Before crafting questions, understand the specific journey being evaluated",
          guidance: [
            "Identify entry point, key decision moments, and exit point",
            "Map emotional peaks and valleys throughout the journey",
            "Distinguish touchpoint types: purchase, onboarding, support, renewal"
          ]
        },
        {
          stepNumber: 2,
          title: "Identify Moments of Truth",
          description: "Focus on critical experiences that disproportionately impact satisfaction",
          guidance: [
            "Find moments where expectations are set or broken",
            "Identify points where customers make stay/leave decisions",
            "Prioritize high-emotion touchpoints over routine interactions"
          ]
        },
        {
          stepNumber: 3,
          title: "Ground Questions in Specific Events",
          description: "Anchor every question to a concrete moment or action",
          guidance: [
            "Ask 'When you [specific action], what happened?' not 'How was your experience?'",
            "Request behavioral details: 'Walk me through what you did'",
            "Avoid hypotheticals; focus on what actually occurred"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What customer journey are you evaluating?",
          purpose: "Identify the specific experience to focus the survey on concrete touchpoints",
          options: [
            "Purchase journey (from discovery to checkout)",
            "Onboarding experience (first-time user setup)",
            "Support interaction (customer service)",
            "Renewal or retention journey",
            "Product usage experience",
            "Other"
          ]
        },
        {
          question: "What are the key touchpoints or steps in this journey?",
          purpose: "Map the journey structure to anchor questions to specific moments",
        },
        {
          question: "What decision will this survey help you make?",
          purpose: "Ensure the survey produces actionable insights, not just satisfaction scores",
          options: [
            "Which touchpoint to redesign first",
            "Why customers are churning",
            "How we compare to competitors",
            "What drives NPS scores",
            "Other"
          ]
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Relationship vs. Transactional survey?",
          options: ["Relationship (overall brand health, quarterly)", "Transactional (specific interaction, immediately after)"],
          recommendation: "Use transactional for actionable improvements; relationship for strategic benchmarking",
          impact: "Wrong choice produces either non-actionable generalities or misses the big picture"
        },
        {
          decision: "Which metric framework to anchor on?",
          options: ["NPS (loyalty/advocacy)", "CSAT (satisfaction with specific interaction)", "CES (effort required)", "Custom composite"],
          recommendation: "Use CES for support/service touchpoints, NPS for relationship surveys, CSAT for specific interactions",
          impact: "Wrong metric means measuring the wrong thing — effort ≠ satisfaction ≠ loyalty"
        }
      ],
      questionArchetypes: [
        {
          name: "Journey Reconstruction",
          whenToUse: "When you need to understand what happened during a specific experience",
          structure: "Walk me through [specific touchpoint]. What happened first? Then what?",
          example: "Walk me through your last support interaction. What was the issue, and what happened when you contacted us?",
          avoidWith: "Short time-constrained surveys — reconstruction takes time"
        },
        {
          name: "Expectation Gap",
          whenToUse: "When you need to understand satisfaction relative to expectations",
          structure: "Compared to what you expected, was [aspect] better, worse, or about the same?",
          example: "Compared to what you expected, was the delivery time faster, slower, or about what you anticipated?",
          avoidWith: "New customers who lack expectations to compare against"
        },
        {
          name: "Effort Assessment",
          whenToUse: "When evaluating friction in a process",
          structure: "How much effort did you personally have to put forth to [complete action]?",
          example: "How much effort did you personally have to put forth to resolve your issue with our support team?",
          avoidWith: "Emotional experiences where effort isn't the primary dimension"
        }
      ],
      designPitfalls: [
        {
          mistake: "Asking 'How satisfied are you overall?' without touchpoint anchoring",
          frequency: "Very common — most first-time survey creators do this",
          consequence: "Produces meaningless average scores with no actionable insight",
          fix: "Always anchor to specific touchpoints: 'How satisfied were you with [specific step]?'"
        },
        {
          mistake: "Surveying too long after the experience",
          frequency: "Common",
          consequence: "Memory decay produces rationalized, generic answers instead of behavioral detail",
          fix: "Survey within 24-48 hours of the experience for transactional; quarterly for relationship"
        }
      ],
      recommendedStructure: {
        idealLength: "8-12 questions, 5-10 minutes for transactional; 15-20 questions for relationship",
        openingStrategy: "Start with the specific touchpoint or moment — 'Let's talk about your recent [experience]'",
        closingStrategy: "End with NPS/CSAT anchor metric, then open-ended 'anything else?' to catch what you missed",
        flowPattern: "Funnel: specific touchpoint → behavioral details → emotional impact → comparative context → recommendation"
      },
      questionPrinciples: [
        {
          principle: "Ground Questions in Specific Events",
          explanation: "Don't ask general impressions; anchor to moments",
          goodExample: "When you first contacted our support team, what were you hoping to accomplish?",
          badExample: "How would you rate your overall experience?",
          rationale: "Specific events yield behavioral details; general questions yield useless platitudes"
        },
        {
          principle: "Ask for Behavioral Reconstruction",
          explanation: "Request step-by-step accounts of what they did",
          goodExample: "Walk me through what happened when you tried to complete checkout",
          badExample: "Was checkout easy?",
          rationale: "Behaviors reveal truth; self-assessments reveal rationalizations"
        },
        {
          principle: "Use Comparative Context",
          explanation: "Understand expectations by asking about comparisons",
          goodExample: "Compared to your expectations, was this faster, slower, or about what you expected?",
          badExample: "Was this fast?",
          rationale: "Satisfaction is relative to expectations, not absolute performance"
        }
      ],
      antiPatterns: [
        {
          pattern: "Never ask 'Why?' after negative rating",
          whyBad: "Puts people on defensive; get rationalized explanations not true causes",
          whatToDoInstead: "Ask them to reconstruct the experience chronologically"
        },
        {
          pattern: "Don't ask 'How satisfied are you overall?'",
          whyBad: "Produces meaningless average scores without actionable insights",
          whatToDoInstead: "Ask about satisfaction with specific touchpoints, then aggregate"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are a Customer Experience Analyst. Focus on specific transactions, touchpoint friction, and behavioral reconstruction. Use terms like 'journey', 'touchpoint', and 'moment of truth'. Ask about specific moments, not general impressions.",
      interactionPatterns: [
        {
          scenario: "When respondent gives low satisfaction score",
          aiGuidance: "Probe the specific moment of failure, not general dissatisfaction. Ask them to reconstruct the experience chronologically.",
          example: "You mentioned frustration with checkout. Walk me through exactly what happened when you tried to complete your purchase."
        },
        {
          scenario: "When respondent gives vague feedback",
          aiGuidance: "Request concrete behavioral details. Ask 'What did you do?' not 'How did you feel?'",
          example: "You said it was confusing. What specifically did you try to do, and what happened?"
        },
        {
          scenario: "When respondent compares to competitors",
          aiGuidance: "Capture the comparison explicitly — this reveals expectations and positioning",
          example: "You mentioned [competitor]. What did they do differently in this situation?"
        }
      ],
      qualityIndicators: [
        "Specific behavioral details (e.g., 'I clicked X three times but nothing happened')",
        "Chronological reconstruction of events",
        "Comparative context (vs. expectations, competitors, previous experiences)",
        "Emotional peaks identified at specific moments",
        "Concrete suggestions for improvement tied to specific touchpoints"
      ],
      questionPrinciples: [
        {
          principle: "Ground Questions in Specific Events",
          explanation: "Don't ask general impressions; anchor to moments",
          goodExample: "When you first contacted our support team, what were you hoping to accomplish?",
          badExample: "How would you rate your overall experience?",
          rationale: "Specific events yield behavioral details; general questions yield useless platitudes"
        },
        {
          principle: "Use Comparative Context",
          explanation: "Understand expectations by asking about comparisons",
          goodExample: "Compared to your expectations, was this faster, slower, or about what you expected?",
          badExample: "Was this fast?",
          rationale: "Satisfaction is relative to expectations, not absolute performance"
        }
      ],
      antiPatterns: [
        {
          pattern: "Never ask 'Why?' after negative rating",
          whyBad: "Puts people on defensive; get rationalized explanations not true causes",
          whatToDoInstead: "Ask them to reconstruct the experience chronologically"
        },
        {
          pattern: "Avoid hypotheticals about future behavior",
          whyBad: "People are terrible at predicting their own behavior",
          whatToDoInstead: "Ask about past behavior and current intentions (NPS-style)"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "CX analytics is about identifying the specific touchpoints and moments of truth that drive customer loyalty or churn. Don't average across journeys — segment by touchpoint, customer segment, and journey stage to find actionable patterns.",
      keyMetrics: [
        {
          name: "Net Promoter Score (NPS)",
          description: "Measures customer loyalty and advocacy likelihood",
          calculation: "% Promoters (9-10) minus % Detractors (0-6)",
          benchmark: "Above 50 is excellent, 30-50 is good, below 0 is critical",
          actionThreshold: "Drop of 10+ points quarter-over-quarter warrants immediate investigation"
        },
        {
          name: "Customer Satisfaction (CSAT)",
          description: "Measures satisfaction with a specific interaction or touchpoint",
          calculation: "% of respondents rating 4-5 on a 5-point scale",
          benchmark: "80%+ is good, 90%+ is excellent, below 70% needs attention",
          actionThreshold: "Any touchpoint below 70% should be prioritized for redesign"
        },
        {
          name: "Customer Effort Score (CES)",
          description: "Measures how much effort the customer had to exert",
          calculation: "Average score on 1-7 scale where 1 = very low effort",
          benchmark: "Below 3 is excellent, above 5 indicates significant friction",
          actionThreshold: "Any score above 4 in support/service contexts needs process improvement"
        },
        {
          name: "Touchpoint Friction Index",
          description: "Identifies which touchpoints cause the most frustration",
          calculation: "Weighted combination of effort, negative sentiment, and dropout mentions per touchpoint",
          benchmark: "Compare across touchpoints; the highest-friction point is priority #1",
          actionThreshold: "Any touchpoint mentioned negatively by >30% of respondents is a red flag"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By journey stage",
          value: "Reveals which part of the journey is failing — discovery, purchase, onboarding, or retention",
          example: "Segment NPS by journey stage: customers who just onboarded vs. 6-month users vs. renewal customers"
        },
        {
          dimension: "By customer segment",
          value: "Different customer types (enterprise vs. SMB, new vs. returning) have different expectations",
          example: "Compare CSAT between first-time buyers and repeat customers to identify onboarding vs. retention issues"
        },
        {
          dimension: "By channel",
          value: "Support via chat, phone, and email may have very different satisfaction profiles",
          example: "Segment CES by support channel to find which channel creates the most friction"
        }
      ],
      statisticalConsiderations: [
        "NPS requires minimum 200+ responses for statistically reliable scores (±7% margin of error at 95% CI)",
        "CSAT is sensitive to timing — responses collected immediately after interaction differ from 48-hour delayed surveys",
        "Beware of response bias: dissatisfied customers are more likely to respond, skewing negative",
        "Longitudinal comparisons require consistent methodology — don't change question wording mid-study",
        "Small segments (< 30 respondents) should not be reported separately; aggregate or flag as directional only"
      ],
      signalVsNoise: [
        {
          signal: "Multiple respondents describe the same specific friction point using similar language",
          noise: "A single respondent's general complaint without behavioral detail",
          howToDistinguish: "Signal appears across 3+ independent conversations; noise is isolated and vague"
        },
        {
          signal: "Behavioral patterns that correlate with satisfaction (e.g., number of steps correlates with dropout)",
          noise: "Emotional expressions that don't tie to specific touchpoints",
          howToDistinguish: "Signal connects to observable actions; noise is general sentiment without a referent"
        }
      ],
      reportingGuidance: {
        audienceFraming: "CX reports are typically read by product managers, CX leaders, and executives. Lead with business impact (revenue at risk, churn drivers), not just scores.",
        keyVisualization: "Journey maps with satisfaction overlay, NPS trend lines over time, touchpoint comparison bar charts, verbatim quote clouds around friction points",
        narrativeStructure: "Start with headline metric (NPS/CSAT trend), drill into which touchpoints drive the score, then recommend specific improvements ranked by impact",
        actionableFormat: "Every insight must include: what's happening, why it matters (business impact), and what to do about it (specific recommendation)"
      }
    }
  },

  // Domain 2: Market Research & Consumer Intelligence
  2: {
    id: 2,
    name: "Market Research & Consumer Intelligence",
    corePrinciple: "Market research is fundamentally predictive and exploratory. Unlike CX (retrospective) or workforce surveys (present state), market research asks: 'What will people do?' and 'Why do they make choices?' It requires uncovering unstated needs, testing hypotheses, and measuring willingness to pay.",

    creationExpert: {
      designPhilosophy: "Market research surveys must separate stated intent from actual behavior. Never accept 'would you buy this?' at face value — always design trade-offs that force real prioritization and anchor to past behavior as the best predictor of future actions.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Define Research Objective Type",
          description: "Clarify whether you're sizing a market, testing a concept, understanding preferences, or identifying segments",
          guidance: [
            "Concept testing: Will people buy this? What resonates?",
            "Market sizing: How many potential customers exist?",
            "Preference research: Which features/benefits matter most?",
            "Segmentation: What distinct customer groups exist?"
          ]
        },
        {
          stepNumber: 2,
          title: "Establish Baseline Behavior",
          description: "Understand current state before introducing new concepts",
          guidance: [
            "Ask about current solutions and workarounds",
            "Identify existing pain points and unmet needs",
            "Map current spending and decision-making process"
          ]
        },
        {
          stepNumber: 3,
          title: "Design Trade-Off Questions",
          description: "Force prioritization to reveal true preferences",
          guidance: [
            "Use MaxDiff, conjoint, or explicit trade-off questions",
            "Don't ask 'Would you like X?'—everyone says yes",
            "Ask 'Would you pay $Y for X?' or 'X vs. Y, which matters more?'"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What type of market research are you conducting?",
          purpose: "Different research types require different methodologies",
          options: [
            "Concept testing (will people buy this new product/feature?)",
            "Market sizing (how big is the opportunity?)",
            "Preference research (which features/benefits matter most?)",
            "Customer segmentation (what distinct groups exist?)",
            "Competitive positioning (how do we compare?)",
            "Other"
          ]
        },
        {
          question: "What's the key hypothesis you're testing?",
          purpose: "Market research should test specific hypotheses, not fish for insights",
        },
        {
          question: "What decision will this research inform?",
          purpose: "Ensure research is actionable and tied to business decisions",
          options: [
            "Go/no-go on product development",
            "Feature prioritization",
            "Pricing strategy",
            "Target market selection",
            "Positioning and messaging",
            "Other"
          ]
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Exploratory vs. Validative research?",
          options: ["Exploratory (discover unknowns, generate hypotheses)", "Validative (test specific hypotheses with measurable outcomes)"],
          recommendation: "Start exploratory to discover the right questions, then validate with structured instruments",
          impact: "Exploratory research with validative questions produces weak insights; validative research without exploration misses the real issues"
        },
        {
          decision: "How to measure purchase intent?",
          options: ["Direct stated intent", "Anchored to price/behavior", "Competitive trade-off"],
          recommendation: "Always anchor to price and current behavior — never accept unanchored intent",
          impact: "Unanchored purchase intent overstates demand by 3-5x; anchored intent is the only reliable predictor"
        }
      ],
      questionArchetypes: [
        {
          name: "Trade-Off Matrix",
          whenToUse: "When you need to understand true feature/benefit priorities",
          structure: "If you had to choose between [A] and [B], which would you pick?",
          example: "If you had to choose: a product that's 30% cheaper or one that arrives in half the time?",
          avoidWith: "When features are not truly substitutable"
        },
        {
          name: "Behavioral Baseline",
          whenToUse: "When establishing current category behavior before testing a concept",
          structure: "In the past [timeframe], how many times have you [behavior]?",
          example: "In the past 6 months, how many times have you purchased [category]? What did you spend?",
          avoidWith: "Infrequent or forgettable purchases (use aided recall instead)"
        },
        {
          name: "Willingness-to-Pay Anchor",
          whenToUse: "When testing pricing and value perception",
          structure: "At what price would [product] be so expensive you wouldn't consider it? At what price would it be so cheap you'd question its quality?",
          example: "At what price would this service be so expensive you wouldn't consider it, even if it solved your problem?",
          avoidWith: "Products where price is not the primary decision factor"
        }
      ],
      designPitfalls: [
        {
          mistake: "Asking 'Would you buy this?' without price anchoring",
          frequency: "Extremely common — the #1 mistake in concept testing",
          consequence: "Produces 70-80% false positive intent; leads to overinvestment in weak concepts",
          fix: "Always include a realistic price: 'Would you pay $X for this?'"
        },
        {
          mistake: "Showing the concept before understanding current behavior",
          frequency: "Common",
          consequence: "Respondents react to your framing rather than their actual needs; can't distinguish real demand from novelty interest",
          fix: "Always establish baseline behavior and pain points before introducing any concept"
        }
      ],
      recommendedStructure: {
        idealLength: "10-15 questions, 10-15 minutes",
        openingStrategy: "Start with current behavior and category usage — establish baseline before introducing concepts",
        closingStrategy: "End with purchase intent (anchored to price), competitive comparison, and open-ended 'what would make this a must-have?'",
        flowPattern: "Baseline behavior → pain points → concept introduction → reaction → trade-offs → purchase intent → barriers"
      },
      questionPrinciples: [
        {
          principle: "Measure Behavior, Not Intent",
          explanation: "What people say they'll do differs from what they actually do",
          goodExample: "In the past 6 months, how many times have you purchased [category]?",
          badExample: "Would you buy this product?",
          rationale: "Past behavior predicts future behavior better than stated intent"
        },
        {
          principle: "Use Trade-Off Questions",
          explanation: "Force prioritization to reveal true preferences",
          goodExample: "If you had to choose: lower price or faster delivery?",
          badExample: "Do you value low prices? Do you value fast delivery?",
          rationale: "Everyone wants everything; trade-offs reveal what matters most"
        },
        {
          principle: "Probe for Purchase Barriers",
          explanation: "Understand what prevents adoption, not just what drives it",
          goodExample: "What would prevent you from buying this, even if you liked it?",
          badExample: "What do you like about this?",
          rationale: "Removing barriers is often more effective than adding features"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask 'Would you buy this?' without price context",
          whyBad: "Everyone says yes when there's no cost; produces false validation",
          whatToDoInstead: "Ask 'Would you pay $X for this?' with realistic pricing"
        },
        {
          pattern: "Don't lead with your concept",
          whyBad: "Biases responses; people react to your framing not their needs",
          whatToDoInstead: "Start with current behavior and pain points, then introduce concept"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are a Market Research Analyst. Focus on uncovering unstated needs, testing hypotheses, and measuring willingness to pay. Use trade-off thinking — always push past surface-level intent to understand real priorities and barriers.",
      interactionPatterns: [
        {
          scenario: "When respondent says they'd buy the product",
          aiGuidance: "Probe for willingness to pay and purchase barriers. Don't accept enthusiasm at face value.",
          example: "You said you'd buy this. At what price point would it become too expensive? What might prevent you from actually purchasing?"
        },
        {
          scenario: "When respondent compares to existing solutions",
          aiGuidance: "Capture detailed competitive context — this reveals positioning opportunities",
          example: "You mentioned you currently use [competitor]. What would this need to do better to get you to switch?"
        },
        {
          scenario: "When respondent gives conflicting preferences",
          aiGuidance: "Use trade-off questions to force prioritization",
          example: "You said both X and Y are important. If you could only have one, which would you choose?"
        }
      ],
      qualityIndicators: [
        "Specific current behaviors and spending patterns",
        "Unprompted mentions of competitors and alternatives",
        "Clear articulation of unmet needs or pain points",
        "Realistic willingness-to-pay ranges",
        "Identification of purchase barriers, not just drivers"
      ],
      questionPrinciples: [
        {
          principle: "Measure Behavior, Not Intent",
          explanation: "What people say they'll do differs from what they actually do",
          goodExample: "In the past 6 months, how many times have you purchased [category]?",
          badExample: "Would you buy this product?",
          rationale: "Past behavior predicts future behavior better than stated intent"
        },
        {
          principle: "Use Trade-Off Questions",
          explanation: "Force prioritization to reveal true preferences",
          goodExample: "If you had to choose: lower price or faster delivery?",
          badExample: "Do you value low prices? Do you value fast delivery?",
          rationale: "Everyone wants everything; trade-offs reveal what matters most"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask 'Would you buy this?' without price context",
          whyBad: "Everyone says yes when there's no cost; produces false validation",
          whatToDoInstead: "Ask 'Would you pay $X for this?' with realistic pricing"
        },
        {
          pattern: "Avoid asking about features in isolation",
          whyBad: "People say they want every feature; doesn't reveal priorities",
          whatToDoInstead: "Use MaxDiff, conjoint, or forced trade-offs"
        },
        {
          pattern: "Don't lead with your concept",
          whyBad: "Biases responses; people react to your framing not their needs",
          whatToDoInstead: "Start with current behavior and pain points, then introduce concept"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Market research analytics is about predicting behavior, not describing it. Focus on identifying the gap between stated intent and likely action. Segment by behavioral patterns (heavy users vs. light), not just demographics. Always discount stated purchase intent by 50-70%.",
      keyMetrics: [
        {
          name: "Purchase Intent (Adjusted)",
          description: "Stated purchase intent discounted for overstatement bias",
          calculation: "Top-2-box intent (definitely/probably buy) × 0.3 adjustment factor",
          benchmark: "Adjusted intent above 20% is promising; above 40% is strong",
          actionThreshold: "Adjusted intent below 10% suggests concept doesn't resonate — pivot or kill"
        },
        {
          name: "Preference Share",
          description: "Share of choices in competitive trade-off scenarios",
          calculation: "% of times concept is chosen over alternatives in forced-choice tasks",
          benchmark: "Above fair share (1/N alternatives) indicates competitive strength",
          actionThreshold: "Below fair share with target segment indicates positioning problem"
        },
        {
          name: "Willingness-to-Pay (WTP) Range",
          description: "Acceptable price range derived from Van Westendorp or similar",
          calculation: "Intersection of 'too expensive' and 'too cheap' curves",
          benchmark: "Optimal price point should fall within 10% of market average for the category",
          actionThreshold: "If WTP ceiling is below production cost, concept is not viable at any positioning"
        },
        {
          name: "Unmet Need Intensity",
          description: "How strongly respondents feel current solutions fail them",
          calculation: "Frequency and emotional intensity of pain point mentions in open-ended responses",
          benchmark: "If >50% of respondents independently mention the same unmet need, it's a real opportunity",
          actionThreshold: "Unmet needs mentioned by <10% are niche; prioritize only if high-value segment"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By behavioral intensity",
          value: "Heavy users have different needs and WTP than light users — critical for market sizing",
          example: "Segment by category purchase frequency: weekly buyers vs. monthly vs. occasional"
        },
        {
          dimension: "By current solution",
          value: "Competitor users reveal switching triggers; non-users reveal adoption barriers",
          example: "Compare concept appeal between current [competitor A] users, [competitor B] users, and non-category users"
        },
        {
          dimension: "By decision-making role",
          value: "Buyers, influencers, and users often have different priorities",
          example: "Segment by role: IT decision-maker vs. end user vs. budget holder"
        }
      ],
      statisticalConsiderations: [
        "Purchase intent is systematically overstated — always apply a discount factor (30-50% of top-2-box is realistic conversion)",
        "Concept test results are sensitive to stimulus quality — poor descriptions produce artificially low scores",
        "Small sample concept tests (n<100) should be treated as directional only — don't make go/no-go decisions on them",
        "Self-reported willingness-to-pay is higher than actual payment behavior by ~20-30%",
        "Segmentation requires minimum 50 respondents per segment for reliable profiles"
      ],
      signalVsNoise: [
        {
          signal: "Respondents independently describe the same unmet need using different words",
          noise: "Respondents agree with a need when you describe it to them",
          howToDistinguish: "Signal is unprompted and consistent across respondents; noise is prompted agreement"
        },
        {
          signal: "Trade-off choices consistently favor one option across segments",
          noise: "General enthusiasm for all features without forced trade-offs",
          howToDistinguish: "Signal emerges from constrained choices; noise comes from unconstrained 'wish lists'"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Market research reports are read by product managers, marketing leaders, and executives making investment decisions. Lead with the business decision (go/no-go, pricing, positioning), not methodology.",
        keyVisualization: "Preference share charts, WTP price sensitivity curves, concept appeal heat maps, competitive positioning perceptual maps, segment profile comparisons",
        narrativeStructure: "Start with the business question, present the key finding, support with data, then recommend action. Always include confidence level and sample limitations.",
        actionableFormat: "Every finding must answer: 'So what should we do?' — include specific product, pricing, or positioning recommendations"
      }
    }
  },

  // Domain 3: Workforce & Organizational Development
  3: {
    id: 3,
    name: "Workforce & Organizational Development",
    corePrinciple: "Workforce surveys measure organizational health, employee engagement, and cultural dynamics. Unlike customer surveys (low stakes) or market research (hypothetical), workforce surveys have high stakes: careers, team dynamics, and retention are on the line. Anonymity architecture and psychological safety are paramount.",

    creationExpert: {
      designPhilosophy: "Workforce surveys live or die on trust. Before a single question is written, the anonymity architecture must be airtight. Then ground every question in observable behaviors, not abstract feelings — 'Can you admit mistakes without fear?' beats 'Is there trust?' every time.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Establish Anonymity Architecture",
          description: "Before asking any questions, guarantee credible anonymity",
          guidance: [
            "Explain how responses will be anonymized and aggregated",
            "Set minimum group size for reporting (typically 5-10 people)",
            "Clarify who will see raw vs. aggregated data",
            "Address fears about retaliation or identification"
          ]
        },
        {
          stepNumber: 2,
          title: "Use Validated Scales",
          description: "Don't invent engagement questions — use proven instruments",
          guidance: [
            "Gallup Q12 for engagement",
            "eNPS for retention risk",
            "Psychological safety scales (Edmondson)",
            "Manager effectiveness frameworks (Google's Project Oxygen)"
          ]
        },
        {
          stepNumber: 3,
          title: "Focus on Specific Behaviors",
          description: "Ask about observable actions, not abstract culture",
          guidance: [
            "Not 'Do you feel valued?' but 'In the past month, has your manager recognized your work?'",
            "Not 'Is there trust?' but 'Can you admit mistakes without fear?'",
            "Behavioral specificity enables action"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What aspect of organizational health are you measuring?",
          purpose: "Different aspects require different methodologies and anonymity levels",
          options: [
            "Employee engagement and satisfaction",
            "Manager effectiveness",
            "Team dynamics and collaboration",
            "Diversity, equity, and inclusion",
            "Organizational culture",
            "Retention risk and turnover drivers",
            "Other"
          ]
        },
        {
          question: "What's the minimum group size for reporting results?",
          purpose: "Establish anonymity threshold to build trust",
          options: [
            "5 people (standard for sensitive topics)",
            "10 people (more conservative)",
            "No minimum (fully anonymous, no demographic breakdowns)"
          ]
        },
        {
          question: "What action will you take based on results?",
          purpose: "Ensure survey leads to change, not just measurement",
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Pulse survey vs. comprehensive annual survey?",
          options: ["Pulse (5-10 questions, monthly/quarterly)", "Comprehensive (40-60 questions, annually)", "Hybrid (pulse + annual deep-dive)"],
          recommendation: "Pulse surveys for ongoing monitoring; comprehensive for strategic planning. Hybrid is ideal but requires commitment to act on results.",
          impact: "Annual-only surveys miss emerging issues; pulse-only surveys lack depth for strategic change"
        },
        {
          decision: "Anonymity level?",
          options: ["Fully anonymous (no demographics)", "Confidential (demographics but no individual identification)", "Named (for 360° or developmental)"],
          recommendation: "Confidential with 5+ group size minimum for most engagement surveys; named only for developmental 360° feedback",
          impact: "Too little anonymity kills honesty; too much prevents segmented insights for targeted action"
        }
      ],
      questionArchetypes: [
        {
          name: "Behavioral Frequency",
          whenToUse: "When measuring observable management or team behaviors",
          structure: "In the past [timeframe], how often has [specific behavior] happened?",
          example: "In the past month, how often has your manager provided specific feedback on your work?",
          avoidWith: "Abstract cultural concepts that can't be observed"
        },
        {
          name: "Psychological Safety Probe",
          whenToUse: "When assessing team trust and openness",
          structure: "If you [potentially risky action], what would happen?",
          example: "If you made a mistake on a project, would you feel comfortable bringing it up with your team?",
          avoidWith: "Newly formed teams where safety hasn't been established"
        },
        {
          name: "Retention Risk Signal",
          whenToUse: "When identifying flight risk and retention drivers",
          structure: "How likely are you to [commitment action] in the next [timeframe]?",
          example: "How likely are you to still be working here in 12 months?",
          avoidWith: "Environments where asking about leaving may itself cause alarm"
        }
      ],
      designPitfalls: [
        {
          mistake: "Asking abstract culture questions like 'Is there trust on your team?'",
          frequency: "Very common",
          consequence: "Everyone interprets 'trust' differently; responses are unmeaningful and unactionable",
          fix: "Operationalize into behaviors: 'Can you admit mistakes without fear?' 'Does your team share information openly?'"
        },
        {
          mistake: "Running a survey without committing to act on results",
          frequency: "Common — 'survey fatigue' is really 'inaction fatigue'",
          consequence: "Destroys trust; future response rates plummet; employees become cynical",
          fix: "Before launching, commit to sharing results and taking at least 2-3 concrete actions"
        }
      ],
      recommendedStructure: {
        idealLength: "12-15 questions for pulse; 40-60 for comprehensive (with validated scales)",
        openingStrategy: "Start with psychological safety framing — reinforce anonymity, explain why feedback matters, commit to action",
        closingStrategy: "End with open-ended 'What one thing would most improve your experience working here?' — often the richest insight",
        flowPattern: "Safety framing → engagement core → manager effectiveness → team dynamics → open-ended → demographics (optional)"
      },
      questionPrinciples: [
        {
          principle: "Use Validated Scales",
          explanation: "Don't invent engagement questions; use proven instruments",
          goodExample: "I know what is expected of me at work (Gallup Q12)",
          badExample: "Do you like your job?",
          rationale: "Validated scales enable benchmarking and have proven predictive validity"
        },
        {
          principle: "Ask About Specific Behaviors",
          explanation: "Observable actions, not abstract feelings",
          goodExample: "In the past month, has your manager provided clear feedback on your work?",
          badExample: "Do you feel supported by your manager?",
          rationale: "Behaviors are actionable; feelings are vague"
        },
        {
          principle: "Include Open-Ended Follow-Ups",
          explanation: "Quantitative scores show what; qualitative explains why",
          goodExample: "You rated collaboration as low. What specific barriers prevent effective teamwork?",
          badExample: "Any other comments?",
          rationale: "Targeted open-ends yield actionable insights"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask 'Are you satisfied?' without context",
          whyBad: "Satisfaction is vague and not predictive of retention or performance",
          whatToDoInstead: "Use validated engagement scales (Gallup Q12, eNPS)"
        },
        {
          pattern: "Avoid asking about culture without defining it behaviorally",
          whyBad: "'Culture' means different things to different people",
          whatToDoInstead: "Ask about specific cultural behaviors: 'Can you admit mistakes without fear?'"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are an Organizational Psychologist. Prioritize psychological safety above all else. Reinforce anonymity guarantees proactively. Ask about observable behaviors and concrete examples, not abstract feelings. Be warm, non-judgmental, and explicitly acknowledge that honest feedback takes courage.",
      interactionPatterns: [
        {
          scenario: "When respondent expresses fear of retaliation",
          aiGuidance: "Reinforce anonymity guarantees and explain aggregation thresholds",
          example: "I understand your concern. Your individual responses will never be shared. Results are only reported for groups of 5+ people, and all identifying details are removed."
        },
        {
          scenario: "When respondent gives low manager effectiveness score",
          aiGuidance: "Probe for specific behaviors, not personal attacks",
          example: "You rated your manager's support as low. Can you describe a recent situation where you needed support? What happened?"
        },
        {
          scenario: "When respondent mentions team conflict",
          aiGuidance: "Focus on observable dynamics and impact on work, not personalities",
          example: "You mentioned team conflict. How does this affect your ability to get work done? What specific behaviors create friction?"
        }
      ],
      qualityIndicators: [
        "Specific behavioral examples rather than general complaints",
        "Constructive suggestions for improvement",
        "Patterns across multiple respondents (not isolated grievances)",
        "Psychological safety indicators (willingness to share honestly)",
        "Actionable insights tied to observable team/manager behaviors"
      ],
      questionPrinciples: [
        {
          principle: "Ask About Specific Behaviors",
          explanation: "Observable actions, not abstract feelings",
          goodExample: "In the past month, has your manager provided clear feedback on your work?",
          badExample: "Do you feel supported by your manager?",
          rationale: "Behaviors are actionable; feelings are vague"
        },
        {
          principle: "Include Open-Ended Follow-Ups",
          explanation: "Quantitative scores show what; qualitative explains why",
          goodExample: "You rated collaboration as low. What specific barriers prevent effective teamwork?",
          badExample: "Any other comments?",
          rationale: "Targeted open-ends yield actionable insights"
        }
      ],
      antiPatterns: [
        {
          pattern: "Never compare individuals or small teams publicly",
          whyBad: "Breaks anonymity, creates competition, damages psychological safety",
          whatToDoInstead: "Report only aggregated data for groups of 5+ people"
        },
        {
          pattern: "Don't ask 'Are you satisfied?' without context",
          whyBad: "Satisfaction is vague and not predictive of retention or performance",
          whatToDoInstead: "Use validated engagement scales (Gallup Q12, eNPS)"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Workforce analytics must prioritize anonymity in reporting as much as in collection. Never report results for groups smaller than the established threshold. Focus on identifying systemic patterns (org-wide, team-level) rather than individual issues. Connect engagement data to business outcomes (retention, productivity, performance) to drive executive action.",
      keyMetrics: [
        {
          name: "Employee Net Promoter Score (eNPS)",
          description: "Measures employee loyalty and retention risk",
          calculation: "% Promoters (9-10) minus % Detractors (0-6) on 'recommend as workplace' question",
          benchmark: "Above 30 is strong, 10-30 is acceptable, below 0 is a retention crisis",
          actionThreshold: "Drop of 15+ points indicates systemic problem; investigate immediately"
        },
        {
          name: "Engagement Index",
          description: "Composite score from validated engagement scale items",
          calculation: "Average of Gallup Q12 or equivalent items on 5-point scale",
          benchmark: "Above 4.0 is strong, 3.5-4.0 is average, below 3.0 is disengaged",
          actionThreshold: "Any Q12 item below 3.0 should trigger targeted intervention"
        },
        {
          name: "Psychological Safety Score",
          description: "Measures team-level trust and openness",
          calculation: "Average of Edmondson safety scale items (e.g., 'I can take risks without fear')",
          benchmark: "Above 4.0 indicates healthy team; below 3.0 indicates fear-driven culture",
          actionThreshold: "Teams below 3.0 need immediate intervention — manager coaching or team restructuring"
        },
        {
          name: "Manager Effectiveness Score",
          description: "Direct report assessment of manager behaviors",
          calculation: "Average across manager behavior items (feedback frequency, support, recognition)",
          benchmark: "Above 4.0 is effective; below 3.0 indicates manager development needed",
          actionThreshold: "Managers below 3.0 on 2+ items should be prioritized for coaching"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By team/department",
          value: "Identifies which teams are thriving vs. struggling — enables targeted intervention",
          example: "Compare engagement scores across teams to find outlier managers (both high and low performers)"
        },
        {
          dimension: "By tenure",
          value: "New hires vs. veterans often have very different engagement drivers and pain points",
          example: "Segment by tenure: <1 year (onboarding quality), 1-3 years (growth opportunities), 3+ years (career progression)"
        },
        {
          dimension: "By management level",
          value: "Individual contributors, managers, and executives experience the organization differently",
          example: "Compare psychological safety scores between ICs and managers to identify power dynamics issues"
        }
      ],
      statisticalConsiderations: [
        "Never report results for groups smaller than the agreed minimum (typically 5-10 people) — this is an ethical, not just statistical, requirement",
        "Engagement scores are susceptible to response bias — high participation rates (>80%) are essential for validity",
        "Longitudinal comparison is the most valuable — track trends, not just absolute scores",
        "Small differences (0.1-0.2 points on 5-point scale) are usually noise; focus on 0.3+ differences",
        "Open-ended comments provide context but are biased toward extreme views (very happy or very unhappy)"
      ],
      signalVsNoise: [
        {
          signal: "Consistent low scores on specific items across multiple teams",
          noise: "One team's outlier score that might reflect a single manager issue",
          howToDistinguish: "Signal is cross-cutting and systemic; noise is isolated to one unit"
        },
        {
          signal: "Correlated declines across related items (e.g., safety + feedback + recognition all drop)",
          noise: "Isolated score drops on single items without correlation to related measures",
          howToDistinguish: "Signal shows patterns across the engagement ecosystem; noise is random fluctuation"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Workforce reports are read by HR leaders, executives, and sometimes the employees themselves. Lead with what's changing (trends) and what you'll do about it (action plans). Never present data without a commitment to action.",
        keyVisualization: "Trend lines over time (quarterly/annual), team comparison heat maps (respecting anonymity thresholds), driver analysis charts showing which items predict retention, benchmark comparisons to industry norms",
        narrativeStructure: "Start with overall health (engagement index trend), drill into biggest movement areas (positive and negative), identify root cause patterns, then present action plan with owners and timelines",
        actionableFormat: "Every finding must be paired with a proposed intervention: 'Manager feedback scores dropped 0.4 points → Action: Launch manager coaching program in Q2 targeting specific feedback skills'"
      }
    }
  },

  // Domain 5: Education & Learning Assessment
  5: {
    id: 5,
    name: "Education & Learning Assessment",
    corePrinciple: "Educational assessment measures learning outcomes, pedagogical effectiveness, and student experience. Unlike customer feedback (transactional) or workforce surveys (organizational), education surveys must balance formative assessment (improving learning) with summative evaluation (measuring achievement), while respecting academic freedom and student rights.",

    creationExpert: {
      designPhilosophy: "Educational assessments must align every question to a specific, measurable learning objective. Separate teaching effectiveness (behavioral, observable) from instructor likability. Design for formative improvement by asking questions whose answers point to concrete pedagogical changes.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Define Assessment Purpose",
          description: "Clarify whether you're measuring learning outcomes, course quality, or institutional effectiveness",
          guidance: [
            "Formative: Improve teaching/learning during the course",
            "Summative: Evaluate achievement at course/program end",
            "Course evaluation: Assess instructor and course design",
            "Program assessment: Measure curriculum effectiveness"
          ]
        },
        {
          stepNumber: 2,
          title: "Align with Learning Objectives",
          description: "Questions must map to specific, measurable learning outcomes",
          guidance: [
            "Reference Bloom's Taxonomy levels (remember, understand, apply, analyze, evaluate, create)",
            "Ask about specific skills/knowledge, not general satisfaction",
            "Connect assessment to stated course objectives"
          ]
        },
        {
          stepNumber: 3,
          title: "Separate Pedagogy from Personality",
          description: "Evaluate teaching effectiveness, not instructor likability",
          guidance: [
            "Focus on observable teaching behaviors",
            "Ask about learning support, not entertainment value",
            "Distinguish between 'engaging' and 'effective'"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What type of educational assessment are you conducting?",
          purpose: "Different assessment types require different methodologies",
          options: [
            "Course evaluation (student feedback on teaching)",
            "Learning outcomes assessment (did students achieve objectives?)",
            "Program assessment (curriculum effectiveness)",
            "Student experience survey (campus life, support services)",
            "Faculty development feedback",
            "Other"
          ]
        },
        {
          question: "What are the specific learning objectives or outcomes you're assessing?",
          purpose: "Ensure assessment aligns with educational goals",
        },
        {
          question: "Will this assessment inform grades, tenure decisions, or other high-stakes outcomes?",
          purpose: "High-stakes assessments require different design and validation",
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Formative vs. summative assessment?",
          options: ["Formative (improve learning during the course)", "Summative (evaluate at end)", "Both (formative early, summative late)"],
          recommendation: "Formative mid-course assessments are more impactful; summative end-of-course evaluations inform future iterations",
          impact: "Formative-only misses accountability; summative-only misses the opportunity to improve learning in real-time"
        },
        {
          decision: "Student self-assessment vs. instructor evaluation?",
          options: ["Student self-assessment of learning", "Evaluation of instructor/course", "Both integrated"],
          recommendation: "Separate these clearly — students evaluating their own learning and evaluating the instructor are different constructs",
          impact: "Mixing them conflates learning achievement with teaching quality; a student can learn a lot with a bad teacher and vice versa"
        }
      ],
      questionArchetypes: [
        {
          name: "Learning Objective Alignment",
          whenToUse: "When assessing whether specific course objectives were achieved",
          structure: "As a result of this course, can you now [specific skill/knowledge]?",
          example: "As a result of this course, can you now design and run a controlled experiment to test a hypothesis?",
          avoidWith: "Abstract objectives that can't be self-assessed (e.g., 'critical thinking')"
        },
        {
          name: "Pedagogical Practice Assessment",
          whenToUse: "When evaluating specific teaching behaviors",
          structure: "How often did the instructor [specific behavior]?",
          example: "How often did the instructor provide detailed written feedback on your assignments within one week?",
          avoidWith: "General personality assessments ('Is the teacher nice?')"
        },
        {
          name: "Challenge-Support Balance",
          whenToUse: "When separating difficulty from quality",
          structure: "The course was [level of challenge], and the support provided was [adequate/inadequate]",
          example: "The course challenged me beyond my comfort zone, but I had the resources and support to succeed.",
          avoidWith: "Low-stakes or review courses where challenge isn't the primary dimension"
        }
      ],
      designPitfalls: [
        {
          mistake: "Asking 'Is the instructor a good teacher?' without specifying teaching behaviors",
          frequency: "Very common in standard course evaluations",
          consequence: "Produces popularity contest results with known gender and racial biases; unactionable for improvement",
          fix: "Ask about specific behaviors: 'Did the instructor provide timely feedback?' 'Were explanations clear?'"
        },
        {
          mistake: "Using the same evaluation for formative and summative purposes",
          frequency: "Common",
          consequence: "Students are less honest when they know results affect tenure decisions",
          fix: "Separate formative (mid-course, anonymous, developmental) from summative (end-of-course, aggregated)"
        }
      ],
      recommendedStructure: {
        idealLength: "8-12 questions for course evaluation; 15-20 for program assessment",
        openingStrategy: "Start with learning self-assessment — 'What did you learn?' before 'How was the teaching?' — primes students to think about outcomes",
        closingStrategy: "End with 'What one change would most improve this course?' — specific, actionable, and often the most valuable response",
        flowPattern: "Learning outcomes self-assessment → pedagogical practices → course design → open-ended improvement suggestions"
      },
      questionPrinciples: [
        {
          principle: "Align Questions with Learning Objectives",
          explanation: "Every question should map to a specific, measurable outcome",
          goodExample: "Can you now analyze a dataset and identify statistical significance? (maps to 'analyze' in Bloom's)",
          badExample: "Did you learn a lot in this course?",
          rationale: "Vague questions produce vague data; objective-aligned questions enable improvement"
        },
        {
          principle: "Ask About Specific Pedagogical Practices",
          explanation: "Focus on teaching behaviors, not personality",
          goodExample: "Did the instructor provide timely, specific feedback on your work?",
          badExample: "Is the instructor a good teacher?",
          rationale: "Behavioral specificity enables actionable faculty development"
        },
        {
          principle: "Distinguish Difficulty from Quality",
          explanation: "Students often conflate challenging courses with poor teaching",
          goodExample: "The course was challenging, but the support provided helped me succeed",
          badExample: "Was the workload reasonable?",
          rationale: "Rigor is valuable; separate difficulty from effectiveness"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask 'Did you like the instructor?'",
          whyBad: "Popularity ≠ effectiveness; biases against rigorous instructors",
          whatToDoInstead: "Ask about specific teaching behaviors: 'Did the instructor provide clear explanations?'"
        },
        {
          pattern: "Don't use course evaluations for high-stakes decisions without validation",
          whyBad: "Student ratings have known biases (gender, race, course difficulty)",
          whatToDoInstead: "Combine with peer observation, learning outcomes data, and self-reflection"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are an Educational Assessment Specialist. Focus on learning outcomes and evidence of skill development. Separate course difficulty from teaching quality. Ask for specific examples of what students learned and how teaching practices supported or hindered learning.",
      interactionPatterns: [
        {
          scenario: "When student gives low rating for instructor",
          aiGuidance: "Probe for specific teaching behaviors, not personality conflicts",
          example: "You rated the instructor's effectiveness as low. Can you describe a specific situation where you needed help? What happened?"
        },
        {
          scenario: "When student conflates difficulty with poor teaching",
          aiGuidance: "Separate challenge from support quality",
          example: "You mentioned the course was hard. Did you feel you had the resources and support to succeed despite the challenge?"
        },
        {
          scenario: "When student mentions learning outcome",
          aiGuidance: "Connect to specific course objectives and ask for evidence",
          example: "You said you can now [skill]. Can you give me an example of when you applied this?"
        }
      ],
      qualityIndicators: [
        "Specific examples of learning or skill development",
        "References to particular assignments, lectures, or activities",
        "Distinction between course difficulty and teaching quality",
        "Constructive suggestions for pedagogical improvement",
        "Evidence of achievement relative to learning objectives"
      ],
      questionPrinciples: [
        {
          principle: "Align Questions with Learning Objectives",
          explanation: "Every question should map to a specific, measurable outcome",
          goodExample: "Can you now analyze a dataset and identify statistical significance?",
          badExample: "Did you learn a lot in this course?",
          rationale: "Vague questions produce vague data; objective-aligned questions enable improvement"
        },
        {
          principle: "Distinguish Difficulty from Quality",
          explanation: "Students often conflate challenging courses with poor teaching",
          goodExample: "The course was challenging, but the support provided helped me succeed",
          badExample: "Was the workload reasonable?",
          rationale: "Rigor is valuable; separate difficulty from effectiveness"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask 'Did you like the instructor?'",
          whyBad: "Popularity ≠ effectiveness; biases against rigorous instructors",
          whatToDoInstead: "Ask about specific teaching behaviors: 'Did the instructor provide clear explanations?'"
        },
        {
          pattern: "Avoid asking about workload without context",
          whyBad: "Students often rate heavy workload negatively even when appropriate",
          whatToDoInstead: "Ask: 'Was the workload appropriate for the learning objectives?'"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Educational analytics must separate learning outcomes from teaching popularity. Focus on evidence of skill/knowledge gain, not satisfaction scores. Account for known biases in student evaluations (gender, race, course difficulty) before drawing conclusions. Prioritize formative insights that lead to pedagogical improvement.",
      keyMetrics: [
        {
          name: "Learning Gain Score",
          description: "Measures perceived knowledge/skill improvement relative to starting point",
          calculation: "Self-reported ability after course minus self-reported ability before (retrospective pre-post)",
          benchmark: "2+ point gain on 5-point scale indicates strong learning; <1 point suggests minimal impact",
          actionThreshold: "Negative or zero gain on any stated learning objective requires immediate course redesign"
        },
        {
          name: "Pedagogical Effectiveness Index",
          description: "Composite score of specific teaching behavior ratings",
          calculation: "Average of feedback quality, explanation clarity, accessibility, and organizational effectiveness items",
          benchmark: "Above 4.0/5.0 is effective; 3.0-4.0 is developing; below 3.0 needs intervention",
          actionThreshold: "Any individual behavior item below 3.0 should trigger targeted faculty development"
        },
        {
          name: "Challenge-Support Ratio",
          description: "Measures whether difficulty is matched by adequate support",
          calculation: "Ratio of 'course was challenging' agreement to 'I had resources to succeed' agreement",
          benchmark: "Ratio near 1.0 means challenge is well-supported; >1.5 means students are struggling without help",
          actionThreshold: "Ratio above 1.5 indicates need for additional scaffolding or support resources"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By course level",
          value: "Introductory vs. advanced courses have different pedagogical expectations and student populations",
          example: "Compare pedagogical effectiveness scores between 100-level and 400-level courses to identify where teaching support is needed"
        },
        {
          dimension: "By assessment type",
          value: "Formative vs. summative assessments reveal different aspects of the learning experience",
          example: "Compare mid-course formative feedback with end-of-course summative evaluations to see if changes were effective"
        },
        {
          dimension: "By modality",
          value: "In-person, online, and hybrid formats create different learning experiences",
          example: "Segment by delivery mode to identify which format best supports specific learning objectives"
        }
      ],
      statisticalConsiderations: [
        "Student evaluations of teaching have documented biases — female and minority instructors receive systematically lower ratings",
        "Response rates below 50% make course evaluations unreliable; aim for 70%+ through strategic timing and reminders",
        "Small class sizes (<15) make quantitative comparisons unreliable; rely more on qualitative comments",
        "Course difficulty confounds with teaching quality — harder courses often receive lower evaluations regardless of teaching quality",
        "Self-reported learning gains are inflated by ~20-30% compared to objective measures; use as directional, not absolute"
      ],
      signalVsNoise: [
        {
          signal: "Multiple students identify the same specific pedagogical practice as helpful or unhelpful",
          noise: "Individual student complaints about workload or difficulty level",
          howToDistinguish: "Signal appears across multiple independent responses; noise correlates with grade expectations"
        },
        {
          signal: "Consistent gap between stated learning objectives and student self-assessed achievement",
          noise: "General satisfaction scores that don't correlate with learning evidence",
          howToDistinguish: "Signal directly addresses learning outcomes; noise reflects overall emotional state"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Educational reports are read by instructors (for development), department chairs (for evaluation), and accreditation bodies (for accountability). Frame for improvement, not judgment.",
        keyVisualization: "Learning outcome achievement heat maps, pedagogical practice radar charts, trend lines across semesters, qualitative theme clouds from open-ended responses",
        narrativeStructure: "Start with learning outcomes achieved, then identify which pedagogical practices drove those outcomes, then recommend specific improvements for the next iteration",
        actionableFormat: "Every finding should suggest a specific pedagogical action: 'Students struggled with [objective] → Consider adding [activity type] before [assessment]'"
      }
    }
  },

  // Domain 6: Civic Engagement & Public Opinion
  6: {
    id: 6,
    name: "Civic Engagement & Public Opinion",
    corePrinciple: "Public opinion polling is fundamentally about giving every individual in a population an equal voice on civic issues. Unlike market research (convenience sampling acceptable) or customer feedback (self-selected), public opinion research carries a democratic obligation: the sample must accurately represent the population, and questions must not bias responses.",

    creationExpert: {
      designPhilosophy: "Public opinion surveys carry a democratic obligation. Every word choice matters — subtle framing can swing results 10-20 percentage points. Design for neutrality above all else, present multiple sides of every issue, and always offer 'don't know' as a legitimate response.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Design Representative Sampling",
          description: "Ensure every member of the population has equal probability of selection",
          guidance: [
            "Use probability sampling (random, stratified, cluster)",
            "Calculate required sample size for desired margin of error",
            "Plan for non-response bias and weighting adjustments",
            "Document sampling methodology for transparency"
          ]
        },
        {
          stepNumber: 2,
          title: "Craft Neutral Question Wording",
          description: "Even subtle word choice can swing results 10-20 percentage points",
          guidance: [
            "Avoid loaded terms ('death tax' vs. 'estate tax')",
            "Present both sides of controversial issues",
            "Test question wording for bias",
            "Use established question banks when possible (Pew, Gallup)"
          ]
        },
        {
          stepNumber: 3,
          title: "Order Questions Strategically",
          description: "Question order creates context effects",
          guidance: [
            "Ask general questions before specific ones",
            "Separate related questions to avoid priming",
            "Randomize response options when appropriate",
            "Place demographics at the end"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What population are you surveying?",
          purpose: "Define the universe for sampling and weighting",
          options: [
            "General public (all adults)",
            "Registered voters",
            "Likely voters",
            "Specific demographic group",
            "Geographic area (city, state, nation)",
            "Other"
          ]
        },
        {
          question: "What is your target margin of error?",
          purpose: "Determine required sample size",
          options: [
            "±3% (requires ~1,000 respondents)",
            "±5% (requires ~400 respondents)",
            "±10% (requires ~100 respondents)",
            "Not sure / exploratory research"
          ]
        },
        {
          question: "Are you measuring opinion on a controversial issue?",
          purpose: "Controversial topics require extra care in neutral wording",
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "How to frame controversial issues?",
          options: ["Single-sided (present one framing)", "Balanced (present both sides)", "Forced choice between positions"],
          recommendation: "Always use balanced framing: 'Some say X, others say Y. Which is closer to your view?'",
          impact: "Single-sided framing can bias results by 10-20 percentage points — this is the #1 source of polling bias"
        },
        {
          decision: "Offer 'Don't Know' option?",
          options: ["Explicitly offer Don't Know", "Don't offer but accept if volunteered", "Force a choice"],
          recommendation: "Always explicitly offer Don't Know — forcing opinions where none exist creates false consensus",
          impact: "Without DK option, 20-40% of respondents will fabricate an opinion, contaminating results"
        }
      ],
      questionArchetypes: [
        {
          name: "Balanced Issue Frame",
          whenToUse: "When measuring opinion on any controversial or partisan issue",
          structure: "Some people say [position A]. Others say [position B]. Which is closer to your view?",
          example: "Some people say government should do more to reduce income inequality. Others say government involvement hurts economic growth. Which is closer to your view?",
          avoidWith: "Non-controversial factual questions"
        },
        {
          name: "Thermometer Rating",
          whenToUse: "When measuring favorability toward people, groups, or institutions",
          structure: "On a scale of 0 to 100, where 0 is very unfavorable and 100 is very favorable, how do you feel about [subject]?",
          example: "On a scale of 0-100, how favorable is your view of [political figure]?",
          avoidWith: "Complex policy issues that can't be reduced to favorability"
        },
        {
          name: "Policy Priority Ranking",
          whenToUse: "When understanding which issues matter most to the public",
          structure: "Which of these issues is most important to you personally?",
          example: "Which of these is the most important issue facing the country: economy, healthcare, immigration, climate change, or national security?",
          avoidWith: "When all options are closely related (use trade-offs instead)"
        }
      ],
      designPitfalls: [
        {
          mistake: "Using loaded or emotional language in question wording",
          frequency: "Common, especially when pollster has an agenda",
          consequence: "Can swing results 10-20 percentage points; produces propaganda, not data",
          fix: "Use neutral terms, test wording with diverse groups, compare to established question banks (Pew, Gallup)"
        },
        {
          mistake: "Not offering a 'Don't Know' or 'No Opinion' option",
          frequency: "Common",
          consequence: "20-40% of respondents fabricate opinions, creating false consensus",
          fix: "Always explicitly offer 'Don't Know / No Opinion' — it's a legitimate and valuable response"
        }
      ],
      recommendedStructure: {
        idealLength: "10-15 questions for issue polls; 20-30 for comprehensive opinion surveys",
        openingStrategy: "Start with general direction-of-country or mood questions to establish context, then move to specific issues",
        closingStrategy: "End with demographics (age, race, party affiliation, geography) — these are necessary for weighting",
        flowPattern: "General mood → specific issues (balanced framing) → policy priorities → demographics for weighting"
      },
      questionPrinciples: [
        {
          principle: "Use Neutral, Balanced Language",
          explanation: "Word choice dramatically affects responses",
          goodExample: "Do you favor or oppose allowing same-sex couples to marry?",
          badExample: "Do you support traditional marriage between a man and a woman?",
          rationale: "Loaded language biases responses; neutral wording measures true opinion"
        },
        {
          principle: "Present Both Sides of Controversial Issues",
          explanation: "Give equal weight to opposing viewpoints",
          goodExample: "Some say X, others say Y. Which is closer to your view?",
          badExample: "Do you agree that X is the right approach?",
          rationale: "One-sided framing creates acquiescence bias"
        },
        {
          principle: "Avoid Double-Barreled Questions",
          explanation: "Ask about one thing at a time",
          goodExample: "Do you approve of the president's economic policy? (separate from foreign policy)",
          badExample: "Do you approve of the president's economic and foreign policy?",
          rationale: "People may agree with one but not the other; can't interpret results"
        }
      ],
      antiPatterns: [
        {
          pattern: "Never use loaded or emotional language",
          whyBad: "Can swing results 10-20 points; produces propaganda, not data",
          whatToDoInstead: "Use neutral terms; test wording with focus groups"
        },
        {
          pattern: "Don't force opinions on those who have none",
          whyBad: "Creates false consensus; people will pick randomly",
          whatToDoInstead: "Always offer 'no opinion' or 'don't know' option"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are a Public Opinion Pollster. Maintain STRICT NEUTRALITY at all times. Never express agreement, surprise, or judgment. Present all sides of issues equally. Explicitly offer 'don't know' options. Ensure anonymity to encourage honest responses on sensitive topics.",
      interactionPatterns: [
        {
          scenario: "When respondent gives socially desirable answer",
          aiGuidance: "Acknowledge sensitivity and reassure anonymity",
          example: "I know this is a sensitive topic. Remember, your responses are completely anonymous. What's your honest view?"
        },
        {
          scenario: "When respondent seems uncertain",
          aiGuidance: "Offer 'don't know' or 'no opinion' option explicitly",
          example: "It's perfectly fine if you haven't formed an opinion on this yet. Would you say you don't know, or do you lean one way?"
        },
        {
          scenario: "When asking about controversial topic",
          aiGuidance: "Present both sides neutrally before asking for opinion",
          example: "Some people believe X, while others believe Y. Which is closer to your view, or do you have a different perspective?"
        }
      ],
      qualityIndicators: [
        "Willingness to express unpopular opinions (indicates trust in anonymity)",
        "Nuanced responses that don't perfectly align with partisan talking points",
        "Admission of uncertainty or 'don't know' when appropriate",
        "Consistency across related questions",
        "Engagement with both sides of controversial issues"
      ],
      questionPrinciples: [
        {
          principle: "Use Neutral, Balanced Language",
          explanation: "Word choice dramatically affects responses",
          goodExample: "Do you favor or oppose allowing same-sex couples to marry?",
          badExample: "Do you support traditional marriage between a man and a woman?",
          rationale: "Loaded language biases responses; neutral wording measures true opinion"
        },
        {
          principle: "Present Both Sides of Controversial Issues",
          explanation: "Give equal weight to opposing viewpoints",
          goodExample: "Some say X, others say Y. Which is closer to your view?",
          badExample: "Do you agree that X is the right approach?",
          rationale: "One-sided framing creates acquiescence bias"
        }
      ],
      antiPatterns: [
        {
          pattern: "Never use loaded or emotional language",
          whyBad: "Can swing results 10-20 points; produces propaganda, not data",
          whatToDoInstead: "Use neutral terms; test wording with focus groups"
        },
        {
          pattern: "Don't force opinions on those who have none",
          whyBad: "Creates false consensus; people will pick randomly",
          whatToDoInstead: "Always offer 'no opinion' or 'don't know' option"
        },
        {
          pattern: "Avoid asking about obscure policies without context",
          whyBad: "People will answer even if they know nothing about the topic",
          whatToDoInstead: "Provide brief, neutral context or screen for awareness first"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Public opinion analytics must always report margin of error and confidence intervals. Never present a poll result without stating sample size, methodology, and limitations. Focus on trends and movement over time rather than single-point estimates. Account for non-response bias, weighting, and likely voter screens.",
      keyMetrics: [
        {
          name: "Margin of Error (MOE)",
          description: "Statistical confidence interval for the poll estimate",
          calculation: "1.96 × √(p(1-p)/n) for 95% confidence, where p is proportion and n is sample size",
          benchmark: "±3% for n≈1000; ±5% for n≈400",
          actionThreshold: "Differences between groups or over time must exceed 2× MOE to be meaningful"
        },
        {
          name: "Opinion Stability",
          description: "How much opinion has shifted over time",
          calculation: "Point change over consecutive polls with consistent methodology",
          benchmark: "Shifts of 5+ points with consistent methodology are significant; 1-2 points is noise",
          actionThreshold: "Rapid shifts of 10+ points indicate a catalytic event — investigate what changed"
        },
        {
          name: "Partisan Gap",
          description: "Difference in opinion between partisan groups",
          calculation: "Difference in % favorable/agree between Democratic and Republican respondents",
          benchmark: "Gap >30 points indicates a highly polarized issue; <10 points suggests bipartisan consensus",
          actionThreshold: "Widening gaps over time indicate increasing polarization on the issue"
        },
        {
          name: "Don't Know Rate",
          description: "Percentage of respondents with no opinion",
          calculation: "% selecting 'don't know' or 'no opinion' out of total respondents",
          benchmark: "5-15% is normal; above 25% suggests the topic is too obscure or the question is confusing",
          actionThreshold: "DK rate above 30% means results are unreliable — too few people have formed opinions"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By party affiliation",
          value: "The most important segmentation in political polling — reveals polarization and consensus",
          example: "Compare approval of [policy] between Democrats, Republicans, and Independents"
        },
        {
          dimension: "By geography",
          value: "Urban/suburban/rural splits often predict electoral and policy outcomes",
          example: "Segment opinion by region, state, or urban vs. rural to identify geographic polarization"
        },
        {
          dimension: "By generation",
          value: "Age cohorts often drive long-term opinion shifts — today's youth opinion is tomorrow's majority view",
          example: "Compare opinion across Gen Z, Millennials, Gen X, and Boomers to predict opinion trajectory"
        }
      ],
      statisticalConsiderations: [
        "Always report margin of error — a 2-point lead within ±3% MOE is a statistical tie",
        "Online panels vs. random-digit dialing produce systematically different results — don't compare across methodologies",
        "Likely voter screens dramatically affect results — registered voters ≠ likely voters",
        "Weighting is essential but introduces its own error — transparent methodology reporting is mandatory",
        "Non-response bias is growing — response rates below 5% require aggressive weighting, which increases uncertainty"
      ],
      signalVsNoise: [
        {
          signal: "Consistent trend across multiple polls with different methodologies",
          noise: "Single poll showing surprising result that contradicts all others",
          howToDistinguish: "Signal appears across independent polls; noise is isolated to one methodology or time point"
        },
        {
          signal: "Opinion shift that follows a major event (policy change, scandal, crisis)",
          noise: "Random fluctuation within margin of error between consecutive polls",
          howToDistinguish: "Signal correlates with identifiable cause; noise has no clear trigger and reverses in next poll"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Public opinion reports are read by journalists, policymakers, and the public. Lead with the headline finding, but ALWAYS include margin of error, sample size, and methodology. Transparency is a democratic obligation.",
        keyVisualization: "Trend lines with confidence bands, partisan gap charts, geographic heat maps, demographic cross-tabs, horse-race bar charts with MOE bars",
        narrativeStructure: "Start with the topline finding, provide context (how this compares to historical trends), break down by key demographics, then discuss methodology and limitations",
        actionableFormat: "For policymakers: 'X% of [constituency] support [policy], up from Y% — this represents a [significant/insignificant] shift. Key demographic splits: [breakdown].'"
      }
    }
  },

  // Domain 7: Scientific & Academic Research
  7: {
    id: 7,
    name: "Scientific & Academic Research",
    corePrinciple: "Academic research surveys must meet rigorous standards of validity, reliability, and ethical oversight. Unlike applied research (CX, market research), academic surveys contribute to generalizable knowledge, require IRB approval, and must be designed to test specific theoretical hypotheses with defensible methodology.",

    creationExpert: {
      designPhilosophy: "Scientific rigor requires that every question maps to a theoretical construct and has established validity. Prefer creating multi-item scales over single items. Prioritize reliability (consistency) and validity (accuracy) above brevity or engagement. Design for reproducibility.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Ground in Theoretical Framework",
          description: "Every question must connect to established theory or research questions",
          guidance: [
            "State hypotheses derived from theory",
            "Define constructs operationally",
            "Justify each measure with literature citations",
            "Explain how data will test hypotheses"
          ]
        },
        {
          stepNumber: 2,
          title: "Ensure Construct Validity",
          description: "Measures must actually capture the theoretical constructs",
          guidance: [
            "Use validated scales from published research when possible",
            "Include multiple items per construct (latent variable modeling)",
            "Test for convergent and discriminant validity",
            "Pilot test with target population"
          ]
        },
        {
          stepNumber: 3,
          title: "Design for IRB Approval",
          description: "Address ethical requirements from the start",
          guidance: [
            "Minimize risk to participants",
            "Ensure informed consent process",
            "Protect confidentiality and anonymity",
            "Plan for data security and retention"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What theoretical framework guides this research?",
          purpose: "Ensure research is grounded in established theory",
        },
        {
          question: "What are your specific research hypotheses?",
          purpose: "Academic research must test explicit, pre-registered hypotheses",
        },
        {
          question: "Are you using validated scales or creating new measures?",
          purpose: "Validated scales have established reliability and validity",
          options: [
            "Using existing validated scales",
            "Adapting existing scales",
            "Creating new measures (requires validation)",
            "Mixed approach"
          ]
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Use existing validated scales or create new ones?",
          options: ["Use established scales (e.g., Big Five)", "Create custom items", "Adapt existing scales"],
          recommendation: "Always use established scales when possible to ensure validity and comparability",
          impact: "Custom items lack known psychometric properties and limit contribution to cumulative science"
        },
        {
          decision: "Within-subjects or between-subjects design?",
          options: ["Within-subjects (same people, multiple conditions)", "Between-subjects (different people, different conditions)", "Correlational (no manipulation)"],
          recommendation: "Choose based on power analysis and feasibility; within-subjects offers more power but carries carryover effects",
          impact: "Determines sample size requirements and statistical tests used"
        }
      ],
      questionArchetypes: [
        {
          name: "Likert Scale Matrix",
          whenToUse: "When measuring latent constructs (e.g., attitude, personality)",
          structure: "Please indicate your agreement with the following statements: [Matrix of 5-7 items]",
          example: "I feel that I have a number of good qualities. (Strongly Disagree to Strongly Agree)",
          avoidWith: "Factual behavior questions where frequency counts are more accurate"
        },
        {
          name: "Attention Check",
          whenToUse: "To filter out inattentive respondents in online panels",
          structure: "To show you are reading carefully, please select 'Somewhat Agree' for this item.",
          example: "I eat concrete for breakfast every day.",
          avoidWith: "In-person interviews where attention is monitored"
        },
        {
          name: "Demographic Covariate",
          whenToUse: "To control for confounding variables",
          structure: "Standardized demographic items (age, gender, SES)",
          example: "What is your highest level of education completed?",
          avoidWith: "Irrelevant personal questions that increase privacy risk without theoretical justification"
        }
      ],
      designPitfalls: [
        {
          mistake: "Modifying validated scales 'just a little bit'",
          frequency: "Very common",
          consequence: "Destroys validity and reliability; cannot compare results to published norms",
          fix: "Use scales exactly as published, or conduct a full re-validation study"
        },
        {
          mistake: "Using single-item measures for complex constructs",
          frequency: "Common",
          consequence: "Low reliability; measurement error swamps the signal",
          fix: "Use multi-item scales (3+ items) for constructs like 'satisfaction', 'anxiety', or 'trust'"
        }
      ],
      recommendedStructure: {
        idealLength: "Variable, but focus on minimizing fatigue effects; put most important measures early",
        openingStrategy: "Informed consent (mandatory), then non-threatening warm-up questions",
        closingStrategy: "Demographics and debriefing (explaining value of participation)",
        flowPattern: "Consent → IVs/manipulations → DVs/measures → Moderators/mediators → Demographics"
      },
      questionPrinciples: [
        {
          principle: "Use Validated Measurement Scales",
          explanation: "Don't invent scales; use published, validated instruments",
          goodExample: "Rosenberg Self-Esteem Scale (10 items, validated across populations)",
          badExample: "On a scale of 1-10, how would you rate your self-esteem?",
          rationale: "Validated scales have established reliability, validity, and norms"
        },
        {
          principle: "Include Multiple Items Per Construct",
          explanation: "Single items have poor reliability; use multi-item scales",
          goodExample: "3-5 items measuring 'job satisfaction' (can calculate Cronbach's alpha)",
          badExample: "How satisfied are you with your job? (single item)",
          rationale: "Multiple items reduce measurement error and enable reliability testing"
        },
        {
          principle: "Operationalize Theoretical Constructs",
          explanation: "Define abstract concepts in measurable terms",
          goodExample: "'Social capital' measured via network size, trust, reciprocity norms",
          badExample: "Do you have social capital?",
          rationale: "Operationalization enables replication and theory testing"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't modify validated scales without re-validation",
          whyBad: "Breaks established psychometric properties; can't compare to norms",
          whatToDoInstead: "Use scales as published or conduct full validation study"
        },
        {
          pattern: "Avoid leading questions that confirm hypotheses",
          whyBad: "Produces confirmation bias; violates scientific objectivity",
          whatToDoInstead: "Use neutral wording; design questions that could disconfirm hypotheses"
        },
        {
          pattern: "Don't collect data without IRB approval",
          whyBad: "Ethical violation; data cannot be published",
          whatToDoInstead: "Submit IRB protocol before any data collection"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are an Academic Researcher. Maintain high ethical standards and scientific neutrality. Follow the protocol exactly to ensure standardization. Do not interpret questions for participants unless the protocol allows. Prioritize informed consent and voluntary participation.",
      interactionPatterns: [
        {
          scenario: "When administering validated scale",
          aiGuidance: "Present items exactly as published; don't paraphrase or adapt",
          example: "I'm going to read some statements. For each, tell me if you strongly agree, agree, disagree, or strongly disagree. [Read item verbatim]"
        },
        {
          scenario: "When participant seems confused by academic language",
          aiGuidance: "Clarify without changing the validated wording if possible, or use standard definitions",
          example: "I must read the question exactly as written to ensure consistency. Would you like me to repeat it?"
        },
        {
          scenario: "When collecting sensitive research data",
          aiGuidance: "Reinforce confidentiality and right to skip questions",
          example: "This next section is sensitive. Remember, your responses are confidential and you can skip any question. Your participation is voluntary."
        }
      ],
      qualityIndicators: [
        "Thoughtful responses to reverse-coded items (indicates attention)",
        "Consistency across related items measuring same construct",
        "Willingness to answer sensitive questions (indicates trust)",
        "Engagement with open-ended theoretical questions",
        "Minimal straight-lining or satisficing behavior"
      ],
      questionPrinciples: [
        {
          principle: "Standardization is Key",
          explanation: "Every participant must experience the survey in the same way",
          goodExample: "Reading instructions verbatim from a script",
          badExample: "Explaining questions in your own words",
          rationale: "Variation in administration introduces systematic error (bias)"
        },
        {
          principle: "Neutrality in Interaction",
          explanation: "The interviewer must not influence the response",
          goodExample: "Recording response without comment",
          badExample: "Saying 'Good answer' or showing surprise",
          rationale: "Interviewer effects can distort data quality"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't improvise explanations for questions",
          whyBad: "Changes the stimulus for that participant, reducing reliability",
          whatToDoInstead: "Repeat the question or use pre-approved definitions"
        },
        {
          pattern: "Don't pressure participants to answer",
          whyBad: "Violates ethics (voluntary participation) and produces bad data",
          whatToDoInstead: "Accept skips/refusals gracefully"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Academic analytics focus on hypothesis testing and effect sizes, not just descriptive statistics. Analyze latent variables, not just single items. Rigorously report p-values, confidence intervals, and reliability coefficients (Cronbach's alpha). Check underlying assumptions (normality, homoscedasticity) before running tests.",
      keyMetrics: [
        {
          name: "Cronbach's Alpha",
          description: "Measure of internal consistency reliability for scales",
          calculation: "Function of number of items and average inter-correlation",
          benchmark: ">0.70 is acceptable; >0.80 is good; >0.90 is excellent",
          actionThreshold: "Alpha < 0.70 requires dropping items or refinement of the scale"
        },
        {
          name: "Effect Size (Cohen's d / Pearson's r)",
          description: "Magnitude of the relationship or difference",
          calculation: "Difference in means divided by pooled standard deviation (d)",
          benchmark: "d=0.2 (small), 0.5 (medium), 0.8 (large)",
          actionThreshold: "Small effects require larger samples to detect; weigh practical significance vs statistical significance"
        },
        {
          name: "P-value",
          description: "Probability of observing results if null hypothesis were true",
          calculation: "Derived from test statistic (t, F, chi-square)",
          benchmark: "<0.05 is standard for significance",
          actionThreshold: "p > 0.05 fails to reject null hypothesis (inconclusive, not proof of no effect)"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By experimental condition",
          value: "The core of experimental analysis — comparing treatment vs control",
          example: "Compare mean scores between Treatment Group A and Control Group"
        },
        {
          dimension: "By moderator variables",
          value: "Testing for interactions — does the effect depend on a third variable?",
          example: "Does the intervention work better for high-SES vs low-SES participants?"
        }
      ],
      statisticalConsiderations: [
        "Power analysis should be conducted a priori to determine sample size",
        "Check for outliers and normality violations before running parametric tests",
        "Use multi-level modeling (HLM) for nested data (e.g., students in classrooms)",
        "Adjust for multiple comparisons (Bonferroni, FDR) to avoid Type I errors",
        "Pre-registration of analysis plan prevents p-hacking and HARKing"
      ],
      signalVsNoise: [
        {
          signal: "Statistically significant difference with medium-to-large effect size",
          noise: "Significant difference in huge sample with tiny effect size (statistical but not practical)",
          howToDistinguish: "Look at effect size (d/r), not just p-value"
        },
        {
          signal: "Convergent validity (correlation with theoretically related measures)",
          noise: "Correlation with theoretically unrelated measures (method variance)",
          howToDistinguish: "examine logic of correlations; multi-trait multi-method matrix"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Academic reports are read by peer reviewers and other scientists. Focus on transparency, rigor, and theoretical contribution.",
        keyVisualization: "Violin plots (distribution + summary), interaction plots with error bars, SEM path diagrams, correlation matrices",
        narrativeStructure: "Introduction (Theory) → Methods (Sample/Measures) → Results (Descriptive/Inferential) → Discussion (Implications/Limitations)",
        actionableFormat: "Not typical for pure research, but for applied: 'The strong relationship (r=.60) between X and Y suggests interventions targeting X will likely improve Y.'"
      }
    }
  },

  // Domain 9: Demographic & Social Characterization
  9: {
    id: 9,
    name: "Demographic & Social Characterization",
    corePrinciple: "Demographic surveys collect sensitive identity-based information (race, gender, income, disability). Unlike other domains, the primary ethical obligation is dignity and privacy. Questions must use inclusive, respectful categories, minimize re-identification risk, and comply with legal protections for sensitive characteristics.",

    creationExpert: {
      designPhilosophy: "Demographic questions touch on identity and privacy. Design them with maximum inclusivity (always include 'Something else' or write-in options) and respect (always include 'Prefer not to say'). Only ask what you truly need for analysis, and explain *why* you are asking it to build trust.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Use Inclusive, Respectful Categories",
          description: "Demographic categories must reflect current understanding of identity",
          guidance: [
            "Use self-identification, not observer classification",
            "Offer 'prefer not to answer' for all sensitive questions",
            "Include write-in options for non-binary identities",
            "Follow federal standards (OMB for race/ethnicity) when required"
          ]
        },
        {
          stepNumber: 2,
          title: "Minimize Re-Identification Risk",
          description: "Combinations of demographics can identify individuals",
          guidance: [
            "Assess re-identification risk (k-anonymity)",
            "Aggregate small categories in reporting",
            "Consider which demographics are truly necessary",
            "Separate demographics from sensitive responses"
          ]
        },
        {
          stepNumber: 3,
          title: "Explain Why You're Asking",
          description: "People are more willing to share when they understand the purpose",
          guidance: [
            "State how demographic data will be used",
            "Explain legal compliance requirements if applicable",
            "Clarify who will see the data and in what form",
            "Emphasize voluntary nature and right to skip"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "Which demographic characteristics do you need to collect?",
          purpose: "Minimize data collection to only necessary characteristics",
          options: [
            "Age",
            "Gender identity",
            "Race/ethnicity",
            "Income/socioeconomic status",
            "Education level",
            "Disability status",
            "Sexual orientation",
            "Geographic location",
            "Other"
          ]
        },
        {
          question: "Why are you collecting this demographic data?",
          purpose: "Ensure legitimate purpose and inform consent language",
          options: [
            "Legal compliance (EEO, Title IX, etc.)",
            "Equity analysis (identify disparities)",
            "Segmentation for analysis",
            "Representation monitoring",
            "Other"
          ]
        },
        {
          question: "What is the smallest group size you'll report separately?",
          purpose: "Prevent re-identification through demographic combinations",
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Standardized vs. granular categories?",
          options: ["Standardized (e.g., Census categories) for benchmarking", "Granular (detailed sub-groups) for specific visibility", "Hybrid (broad categories with drill-down)"],
          recommendation: "Use hybrid approach: standard high-level categories for reporting, but allow granular write-ins for inclusion",
          impact: "Too broad erases distinct experiences; too granular makes analysis impossible due to small N"
        },
        {
          decision: "Placement of demographic questions?",
          options: ["At the beginning (screening)", "At the end (standard)", "Scattered (contextual)"],
          recommendation: "Place at the END unless used for screening. Early demographic questions can trigger stereotype threat and reduce performance/honesty.",
          impact: "Asking gender/race before a test can lower scores for marginalized groups (stereotype threat)"
        }
      ],
      questionArchetypes: [
        {
          name: "Inclusive Identity Selection",
          whenToUse: "When asking about gender, race, or sexual orientation",
          structure: "Select all that apply, with write-in and opt-out",
          example: "How do you describe your gender identity? [Man, Woman, Non-binary, Prefer to self-describe: ___, Prefer not to say]",
          avoidWith: "Legal forms that require strict biological sex (unless legally mandated)"
        },
        {
          name: "Single-item SES Proxy",
          whenToUse: "When income is too sensitive to ask directly",
          structure: "Ask about tangible indicators (e.g., zip code, free lunch eligibility, education)",
          example: "What is the highest level of education completed by your parents?",
          avoidWith: "High-income populations where these proxies don't differentiate"
        },
        {
          name: "Disability/Accessibility Needs",
          whenToUse: "To identify accommodation requirements",
          structure: "Functional limitations rather than medical diagnosis",
          example: "Do you have a condition or disability that requires accommodation to access our services?",
          avoidWith: "Asking for specific medical diagnoses (privacy violation)"
        }
      ],
      designPitfalls: [
        {
          mistake: "Using 'Other' as a category label",
          frequency: "Common",
          consequence: "Othering and alienating to respondents",
          fix: "Use 'Another identity not listed' or 'Prefer to self-describe' instead of just 'Other'"
        },
        {
          mistake: "Forcing binary gender",
          frequency: "Decreasing but still common",
          consequence: "Alienates non-binary users and collects incorrect data",
          fix: "Always include Non-binary and/or self-describe options"
        }
      ],
      recommendedStructure: {
        idealLength: "Keep it short — only ask what you will use. 3-5 demographic questions max for standard surveys.",
        openingStrategy: "Explanation statement: 'The following questions help us ensure we are serving all communities equally.'",
        closingStrategy: "Thank you and reiteration of privacy/anonymity",
        flowPattern: "Content questions → Transition statement → Demographics (least sensitive to most sensitive)"
      },
      questionPrinciples: [
        {
          principle: "Use Self-Identification",
          explanation: "Let people define their own identity",
          goodExample: "What is your gender identity? (Woman, Man, Non-binary, Prefer to self-describe: ___, Prefer not to answer)",
          badExample: "What is your sex? (Male/Female)",
          rationale: "Self-identification respects autonomy and captures accurate data"
        },
        {
          principle: "Always Offer 'Prefer Not to Answer'",
          explanation: "Demographic questions are sensitive; participation must be voluntary",
          goodExample: "What is your annual household income? [ranges] or Prefer not to answer",
          badExample: "What is your annual household income? [ranges only, no opt-out]",
          rationale: "Forced responses reduce trust and data quality"
        },
        {
          principle: "Explain the Purpose",
          explanation: "People share sensitive data when they understand why",
          goodExample: "We ask about race/ethnicity to ensure our services reach all communities equitably. This data is reported only in aggregate.",
          badExample: "[Ask demographic question without context]",
          rationale: "Transparency increases response rates and trust"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't use binary gender categories only",
          whyBad: "Excludes non-binary individuals; fails to capture accurate data",
          whatToDoInstead: "Offer Man, Woman, Non-binary, and write-in option"
        },
        {
          pattern: "Avoid collecting demographics you don't need",
          whyBad: "Increases privacy risk and respondent burden",
          whatToDoInstead: "Only ask for demographics essential to your analysis"
        },
        {
          pattern: "Don't report small demographic groups separately",
          whyBad: "Creates re-identification risk",
          whatToDoInstead: "Aggregate groups smaller than 5-10 people"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are a Demographer. Maintain a respectful, neutral, and professional tone. Your primary goal is to make the respondent feel safe providing sensitive information. Never express surprise or judgment. Always read the privacy statement before asking demographic questions.",
      interactionPatterns: [
        {
          scenario: "When asking about sensitive identity characteristics",
          aiGuidance: "Explain purpose, emphasize voluntary nature, and offer opt-out",
          example: "I'm going to ask some demographic questions to help us understand who we're serving. These are optional, and you can skip any you're not comfortable answering. What is your gender identity?"
        },
        {
          scenario: "When respondent hesitates on sensitive question",
          aiGuidance: "Reinforce that it's optional and explain how data will be protected",
          example: "I understand this is personal. Your responses are confidential and reported only in aggregate. You're welcome to skip this question if you prefer."
        },
        {
          scenario: "When respondent's identity doesn't fit provided categories",
          aiGuidance: "Offer write-in option and thank them for sharing",
          example: "If none of these options fit your identity, you can describe it in your own words, or select 'prefer not to answer.'"
        }
      ],
      qualityIndicators: [
        "Willingness to answer sensitive questions (indicates trust)",
        "Use of write-in options when provided (indicates inclusive design)",
        "Consistency across related demographic questions",
        "Low rates of 'prefer not to answer' (indicates good question design)",
        "Demographic distribution matches known population parameters"
      ],
      questionPrinciples: [
        {
          principle: "Explain the 'Why'",
          explanation: "Always provide context before asking sensitive questions",
          goodExample: "To help us check if our hiring practices are equitable, are you willing to share...",
          badExample: "How old are you?",
          rationale: "Context reduces suspicion and increases response rates"
        },
        {
          principle: "Respect Refusal",
          explanation: "Never pressure a respondent on demographics",
          goodExample: "That's perfectly fine, we'll skip that one.",
          badExample: "We really need this data for the survey to count.",
          rationale: "Respect builds long-term trust; pressure destroys it"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't assume gender/race based on voice or name",
          whyBad: "Often incorrect and can be offensive; violates self-id principle",
          whatToDoInstead: "Always ask: 'How do you describe your...'"
        },
        {
          pattern: "Don't react to demographic answers",
          whyBad: "Can make respondents feel judged or objectified",
          whatToDoInstead: "Record answer neutrally and move on"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Demographic analytics must balance the need for disaggregation (to find disparities) with the need for privacy (to protect individuals). Never report results for groups smaller than 5-10 people. Focus on representation (who is missing?) and equity (who is underserved?) rather than just description.",
      keyMetrics: [
        {
          name: "Representation Index",
          description: "Comparison of survey demographics to target population benchmarks",
          calculation: "% in survey / % in target population (e.g., Census)",
          benchmark: "0.8 - 1.2 is good representation; <0.8 is under-represented",
          actionThreshold: "Index < 0.6 indicates critical under-representation requiring targeted sampling"
        },
        {
          name: "Intersectionality Gap",
          description: "Outcome differences for groups at the intersection of multiple identities",
          calculation: "Outcome for Subgroup A interaction with Subgroup B (e.g., Black Women) vs overall average",
          benchmark: "Deviations > 10% from average indicate specific intersectional barriers",
          actionThreshold: "Significant intersectional gaps require qualitative follow-up to understand unique barriers"
        },
        {
          name: "Missing Data Rate",
          description: "Percentage of 'prefer not to answer' or skips per item",
          calculation: "Count of missing/opt-out / Total respondents",
          benchmark: "<5% is good; >10% indicates the question is too sensitive or poorly worded",
          actionThreshold: "Rate > 15% implies the data is not usable for that variable"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By intersectional identity",
          value: "Reveals compounded disparities that single-axis analysis misses",
          example: "Don't just look at 'Women' and 'Minorities' separately; look at outcomes for 'Minority Women'"
        },
        {
          dimension: "By life stage",
          value: "Age + Household composition (e.g., 'Parents with young children')",
          example: "Segment by life stage to understand evolving needs (e.g., housing, benefits)"
        }
      ],
      statisticalConsiderations: [
        "Small sample sizes in minority groups usually lack power for statistical significance — DO NOT interpret lack of significance as 'no disparity'",
        "Weighting can correct for under-representation but increases margin of error — effective sample size (neff) decreases",
        "Differential response bias — some groups may be systematically more likely to respond positively/negatively",
        "Privacy thresholds (k-anonymity) must be enforced in all reporting — suppress cells with n < 5 or n < 10"
      ],
      signalVsNoise: [
        {
          signal: "Consistent disparity across multiple outcome measures for a specific group",
          noise: "Single measure showing disparity for a small sub-group (n<30)",
          howToDistinguish: "Look for patterns across outcomes, not just one chart; check sample size"
        },
        {
          signal: "Missing data patterns correlated with other demographics (e.g., high income people skipping income question)",
          noise: "Random missing data distributed evenly",
          howToDistinguish: "Run logistic regression to predict missingness based on other variables"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Demographic reports are sensitive. Avoid deficit framing (blaming the group). Focus on systems and structural factors. Always protect privacy.",
        keyVisualization: "Population pyramids, representation heatmaps (vs benchmark), disparity gap charts, stacked bars for composition",
        narrativeStructure: "Overview of Sample Composition (vs Target) → Key Equity Findings (Disparities) → Intersectional Deep Dive → Recommendations",
        actionableFormat: "Highlight gaps in reach: 'We are under-indexing with Gen Z (0.4 representation index). Recommend targeted outreach on [channel].'"
      }
    }
  },

  // Domain 10: Infrastructure & Systems Performance
  10: {
    id: 10,
    name: "Infrastructure & Systems Performance",
    corePrinciple: "Infrastructure surveys measure technical system reliability, efficiency, and operational health. Unlike customer satisfaction (emotional) or market research (predictive), infrastructure assessment is diagnostic: identifying technical failures, capacity constraints, and performance degradation. Respondents are typically IT staff, system administrators, or technical users.",

    creationExpert: {
      designPhilosophy: "Infrastructure surveys must be precise, diagnostic, and time-bound. Vague questions ('Is the system good?') are useless. Questions must target specific performance metrics (latency, uptime, error rates) and operational states. The goal is to isolate the root cause of issues, not just measure sentiment.",
      creationProcess: [
        {
          stepNumber: 1,
          title: "Define Performance Baselines and SLAs",
          description: "Establish what 'normal' looks like before asking about deviations",
          guidance: [
            "Reference Service Level Agreements (SLAs)",
            "Define acceptable latency/downtime thresholds",
            "Identify key performance indicators (KPIs)",
            "Map dependencies between system components"
          ]
        },
        {
          stepNumber: 2,
          title: "Structured Diagnostic Flow",
          description: "Design questions to isolate failure domains",
          guidance: [
            "Start broad (Is it working?) then narrow (Network? Storage? Compute?)",
            "Use branching logic based on reported symptoms",
            "Collect timestamp and environmental data",
            "Distinguish between constant vs. intermittent issues"
          ]
        },
        {
          stepNumber: 3,
          title: "Impact Assessment",
          description: "Quantify the business impact of technical issues",
          guidance: [
            "Measure user productivity loss",
            "Estimate potential revenue impact",
            "Assess security implications",
            "Determine urgency of required fix"
          ]
        }
      ],
      onboardingQuestions: [
        {
          question: "What specific system or infrastructure are you evaluating?",
          purpose: "Scope the survey to the correct technical domain",
        },
        {
          question: "Are you measuring routine performance or diagnosing an incident?",
          purpose: "Determines if survey is longitudinal (monitoring) or acute (incident response)",
          options: [
            "Routine health check / monitoring",
            "Post-incident review (Post-mortem)",
            "Capacity planning assessment",
            "User acceptance testing (UAT)"
          ]
        },
        {
          question: "Who are the respondents (Users vs. Admins)?",
          purpose: "Tailor technical depth of questions",
          options: [
            "End users (focus on symptoms/impact)",
            "System Administrators (focus on root cause/logs)",
            "Developers (focus on code/integration)",
            "Management (focus on SLAs/cost)"
          ]
        }
      ],
      criticalDesignDecisions: [
        {
          decision: "Automated telemetry vs. Human reporting?",
          options: ["Rely on logs/monitoring tools", "Ask humans for subjective experience", "Hybrid approach"],
          recommendation: "Use surveys for what logs CAN'T tell you: usability friction, process bottlenecks, or unlogged errors. Don't ask humans for uptime stats you can measure automatically.",
          impact: "Asking humans for machine data frustrates respondents and yields inaccurate data"
        },
        {
          decision: "Named vs. Anonymous?",
          options: ["Anonymous (better for psychological safety)", "Named (better for follow-up debugging)"],
          recommendation: "For incident diagnosis, Named is usually required to troubleshoot specific nodes/accounts. For culture/process, Anonymous is better.",
          impact: "Anonymous surveys prevent you from investigating specific user logs"
        }
      ],
      questionArchetypes: [
        {
          name: "Symptom Checklist",
          whenToUse: "Diagnosing widespread issues",
          structure: "Select all issues experienced in the last [timeframe]",
          example: "Which of the following have you experienced today? [Slow login, Disconnected session, Unable to save, frozen screen]",
          avoidWith: "Asking for technical root causes from non-technical users"
        },
        {
          name: "Frequency/Severity Matrix",
          whenToUse: "Prioritizing technical debt or bugs",
          structure: "Rate frequency and severity of specific errors",
          example: "How often does the VPN disconnect? (Daily/Weekly/Monthly) x How much does this impact your work? (Blocker/Annoyance/Ignorable)",
          avoidWith: "Rare, catastrophic events (frequency is low but impact is infinite)"
        },
        {
          name: "Process Friction Assessment",
          whenToUse: "Evaluating DevOps/IT workflows",
          structure: "Time-to-complete estimates for standard tasks",
          example: "How long does it typically take to provision a new development environment?",
          avoidWith: "Tasks that vary wildly in scope"
        }
      ],
      designPitfalls: [
        {
          mistake: "Asking end-users to diagnose infrastructure",
          frequency: "Common",
          consequence: "Getting 'The server is down' when really 'The WiFi is slow'",
          fix: "Ask about symptoms ('I can't load pages'), not causes ('DNS failure')"
        },
        {
          mistake: "Ignoring the 'It works for me' bias",
          frequency: "Common in IT",
          consequence: "Local optimization while ignoring edge cases",
          fix: "Ask about specific environments/locations/devices"
        }
      ],
      recommendedStructure: {
        idealLength: "Short and tactical. 5-10 questions max for routine checks.",
        openingStrategy: "Confirm system scope: 'Questions regarding the [Region] Data Center migration'",
        closingStrategy: "Free text for screenshots/logs paste (if secure) or specific error codes",
        flowPattern: "Scope/Context → Symptom Identification → Impact Assessment → Environmental Details"
      },
      questionPrinciples: [
        {
          principle: "Differentiate Symptom from Cause",
          explanation: "Users report symptoms; Admins find causes",
          goodExample: "What error message did you see?",
          badExample: "Was it a DNS issue?",
          rationale: "Users often misdiagnose technical root causes"
        },
        {
          principle: "Ask for Specific Timestamps",
          explanation: "Correlating reports with logs requires time",
          goodExample: "At what time did you first notice the slowdown?",
          badExample: "When did it happen?",
          rationale: "Vague timing makes log correlation impossible"
        },
        {
          principle: "Quantify Impact",
          explanation: "Understand business cost of downtime",
          goodExample: "How many hours of work were lost due to this outage?",
          badExample: "Was it bad?",
          rationale: "Prioritization requires quantifiable business impact"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't ask about uptime feelings",
          whyBad: "Uptime is a factual metric; feelings are irrelevant",
          whatToDoInstead: "Measure uptime with tools; ask users about communication effectiveness during outages"
        },
        {
          pattern: "Avoid jargon with non-technical users",
          whyBad: "Confuses users and yields random data",
          whatToDoInstead: "Use plain language descriptions of technical failures"
        }
      ]
    },

    conductingExpert: {
      interviewerPersona: "You are a Systems Analyst. Be precise, logical, and detail-oriented. Focus on facts, timestamps, and error codes. Avoid vague language. Your goal is to gather enough distinct information to triage or solve the technical issue.",
      interactionPatterns: [
        {
          scenario: "When user reports a technical issue",
          aiGuidance: "Ask for specific error messages, timestamps, and steps to reproduce",
          example: "Can you recall the exact error message? Or what action you were taking immediately before the crash?"
        },
        {
          scenario: "When assessing severity",
          aiGuidance: "Determine if it's a blocker or a hindrance",
          example: "Is this preventing you from working entirely, or can you work around it?"
        },
        {
          scenario: "When clarifying technical details",
          aiGuidance: "Guide the user to find the info",
          example: "To find the version number, please check the 'Help' menu. What number do you see there?"
        }
      ],
      qualityIndicators: [
        "Specific error codes or messages provided",
        "Precise timestamps for correlation",
        "Clear distinction between 'always' vs 'sometimes'",
        "Identification of affected vs unaffected systems",
        "Steps to reproduce the issue"
      ],
      questionPrinciples: [
        {
          principle: "Isolate the Variable",
          explanation: "Determine scope of impact",
          goodExample: "Does this happen on WiFi, wired connection, or both?",
          badExample: "ls the internet working?",
          rationale: "Helps narrow down failure domain"
        },
        {
          principle: "Verify Environment",
          explanation: "Configuration matters",
          goodExample: "Are you connected to the VPN?",
          badExample: "Are you set up correctly?",
          rationale: "Users often forget prerequisite configurations"
        }
      ],
      antiPatterns: [
        {
          pattern: "Don't accept 'It's broken' as an answer",
          whyBad: "Not actionable for engineering",
          whatToDoInstead: "Probe: 'Broken how? What exactly happens?'"
        },
        {
          pattern: "Don't suggest solutions during the survey",
          whyBad: "Bias the data ('Oh yeah maybe it was that')",
          whatToDoInstead: "Collect symptoms first, suggest fixes after data collection"
        }
      ]
    },

    analyticsExpert: {
      analysisPhilosophy: "Infrastructure analytics is about correlation and root cause analysis. Link survey sentiment/reports with hard telemetry (CPU, memory, latency). Look for spatial or temporal clusters (e.g., everyone on the 3rd floor, everyone at 9:00 AM) to identify common failure modes.",
      keyMetrics: [
        {
          name: "mttr_perception_gap",
          description: "Difference between actual MTTR (Mean Time To Recovery) and User Perceived Resolution Time",
          calculation: "User Reported Downtime - System Logged Downtime",
          benchmark: "Gap < 10% is good communication; Gap > 50% implies poor status updates",
          actionThreshold: "Large gap requires better status page communication strategies"
        },
        {
          name: "System Usability Scale (SUS)",
          description: "Standardized measure of usability",
          calculation: "10-item scale scoring 0-100",
          benchmark: ">68 is above average; >80 is excellent",
          actionThreshold: "SUS < 50 indicates system needs redesign"
        },
        {
          name: "Shadow IT Rate",
          description: "Percentage of users using unauthorized tools due to infrastructure friction",
          calculation: "% of users reporting use of non-standard tools",
          benchmark: "<10% is healthy innovation; >30% represents failure of central IT",
          actionThreshold: "High rates require adopting the shadow tool or fixing the central tool"
        }
      ],
      segmentationStrategies: [
        {
          dimension: "By location/subnet",
          value: "Identifies network-specific issues",
          example: "Compare satisfaction in NY office vs London office"
        },
        {
          dimension: "By role/permission level",
          value: "Identifies access control friction",
          example: "Do admins rate performance higher than read-only users?"
        }
      ],
      statisticalConsiderations: [
        "Survivorship bias: People who can't log in can't take the survey about login issues",
        "Extreme response bias: Only angry users report infrastructure issues (bimodal distribution)",
        "Correlation does not imply causation: High CPU usage might strictly correlate with dissatisfied users, but both might be caused by a third factor (Monday morning traffic)"
      ],
      signalVsNoise: [
        {
          signal: "Cluster of reports from same subnet/version",
          noise: "isolated reports of generic slowness",
          howToDistinguish: "Geospatial/Version clustering analysis"
        },
        {
          signal: "Specific error code reported by multiple users",
          noise: "Vague descriptions like 'glitchy'",
          howToDistinguish: "Text analysis for specific technical keywords"
        }
      ],
      reportingGuidance: {
        audienceFraming: "Infrastructure reports go to CTOs and Engineering Managers. They care about stability, cost, and efficiency. Focus on 'Time lost' and 'Productivity impact'.",
        keyVisualization: "Heatmaps of issues by location/time, Pareto charts of top error types, Trend lines of user sentiment overlaying system availability graphs",
        narrativeStructure: "Executive Summary (Health Score) → Top Friction Points → Resource/Capacity Analysis → Recommendations for Upgrade/Fix",
        actionableFormat: "Quantify lost time: 'Login latency costs the company 500 hours/week. Fixing SSO will ROI in 1 month.'"
      }
    }
  }
};

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
    description: "Conducting rigorous research for generalizable knowledge.",
    scope: "Academic context. Focus on theoretical constructs and hypothesis testing.",
    personaInstruction: "You are an Academic Researcher. Focus on VALIDITY, RELIABILITY, and ETHICS. Use precise, neutral language. Do not infer beyond the data. Prioritize informed consent.",
    shadowRequirements: ["Research Hypothesis", "Target Population", "Ethical/IRB Context"],
    examples: ["Longitudinal study", "Psychometric scale validation", "Social psychology experiment"]
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


// ============================================================================
// Public API
// ============================================================================

/**
 * Get full domain expertise for a specific domain
 */
export function getDomainExpertise(domainId: number): DomainExpertise | null {
  if (!domainId || !DOMAIN_EXPERTISE[domainId]) {
    return null;
  }
  return DOMAIN_EXPERTISE[domainId];
}

/**
 * Get creation expertise for a domain (survey design, question archetypes, etc.)
 */
export function getCreationExpertise(domainId: number): CreationExpertise | null {
  const expertise = getDomainExpertise(domainId);
  return expertise?.creationExpert || null;
}

/**
 * Get conducting expertise for a domain (interviewer persona, interaction patterns)
 */
export function getConductingExpertise(domainId: number): ConductingExpertise | null {
  const expertise = getDomainExpertise(domainId);
  return expertise?.conductingExpert || null;
}

/**
 * Get analytics expertise for a domain (key metrics, thresholds, segmentation)
 */
export function getAnalyticsExpertise(domainId: number): AnalyticsExpertise | null {
  const expertise = getDomainExpertise(domainId);
  return expertise?.analyticsExpert || null;
}

/**
 * Get domain-specific onboarding questions
 */
export function getOnboardingQuestions(domainId: number): OnboardingQuestion[] {
  const expert = getCreationExpertise(domainId);
  return expert?.onboardingQuestions || [];
}

/**
 * Get question construction principles for a domain
 */
export function getQuestionPrinciples(domainId: number): QuestionPrinciple[] {
  const expert = getCreationExpertise(domainId);
  return expert?.questionPrinciples || [];
}

/**
 * Get interaction patterns for survey execution
 */
export function getInteractionPatterns(domainId: number): InteractionPattern[] {
  const expert = getConductingExpertise(domainId);
  return expert?.interactionPatterns || [];
}

/**
 * Check if a domain has expert knowledge available
 */
export function hasDomainExpertise(domainId: number): boolean {
  return !!DOMAIN_EXPERTISE[domainId];
}



/**
 * Get list of all domains with expertise
 */
export function getAvailableDomains(): number[] {
  return Object.keys(DOMAIN_EXPERTISE).map(Number);
}

export function getDomainById(id: number): SurveyDomain | undefined {
  return SURVEY_DOMAINS[id as SurveyDomainId];
}

export function getAllDomains(): SurveyDomain[] {
  return Object.values(SURVEY_DOMAINS);
}
