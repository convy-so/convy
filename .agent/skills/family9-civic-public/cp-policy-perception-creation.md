---
name: Policy Perception Research (Creation)
description: Briefing agent skill for designing Policy Perception Research. Guides the Creation agent to extract a complete, validated research brief focusing on public understanding, ideological resistance, and compliance willingness regarding new legislation or civic initiatives.
id: cp-policy-perception-creation
version: 1.0.0
---

# Section 1: Domain Identity
Policy Perception Research evaluates the gap between "Legislative Intent" and "Public Interpretation." When a government passes a law (e.g., a new carbon tax, a zoning change, a school districting plan), the public rarely reads the actual text. They react to the *narrative* of the policy. This domain isolates whether the public actually understands the mechanics of the policy, whether they believe the policy will achieve its stated goals, and what specific narratives are driving resistance or support.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic opposes a policy that objectively benefits them financially
- What specific piece of misinformation is the primary driver of public resistance
- Whether the public believes a new policy is actually enforceable
- The gap between theoretical support for a goal and practical support for the policy's mechanics

**Cannot answer:**
- Whether the citizen trusts the Mayor who signed the policy (requires Community Trust)
- How difficult it is to physically apply for the benefits the policy created (requires Citizen Service)

# Section 3: Brief Interrogation Guide
**The Core Misconception Hypothesis:**
- What does the agency *believe* is the main reason the public hates/misunderstands this policy? The AI must capture this hypothesis so the Conducting agent can test if the agency's assumption is correct.

**The Compliance Mechanism:**
- Does this policy require voluntary public compliance (e.g., sorting recycling) or is it a mandatory enforcement (e.g., speed cameras)? Voluntary policies require much deeper narrative buy-in.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that the public fundamentally misunderstands how the new tax brackets work, will you allocate $500,000 for a public education campaign, or just ignore the angry emails?
- If the data shows that citizens agree with the policy but believe it is impossible to enforce, will you increase visible enforcement mechanisms?

**Well-formed decision map example:**
> Policy outcome: If opposition is primarily driven by the 'Job Loss' narrative, the Governor's office will pivot the messaging entirely to highlight the 5,000 new union jobs created by the bill. If opposition is primarily driven by apathy (nobody knows what the bill does), we will deploy targeted social media ads explaining the direct household financial impact.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Narrative Comprehension (Do they get it?) | 25% | Root | 0.85 |
| Ideological Alignment (Do they agree?) | 20% | Root | 0.80 |
| Misinformation & Rumor Tracing | 20% | Root | 0.80 |
| Personal Impact Perception (WIIFM) | 20% | Root | 0.85 |
| Perceived Enforceability & Realism | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The High-Information Voter vs The Casual Observer: The brief must establish if the target audience reads long-form news about city council meetings, or only gets policy information through 15-second TikTok videos.

# Section 7: Constitutional Constraints
1. **The 'Deficit Model' Ban.** The AI must prevent the client from assuming that if the public opposes the policy, it's just because the public is stupid or "uneducated." The AI must force the client to treat public opposition as a rational response to the information the public currently possesses.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Pulse Check on a Minor Ordinance | Low | 15–20 mins |
| Message-Testing for a Controversial Bill | Moderate | 25–35 mins |
| Post-Mortem on a Failed Civic Initiative | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Specific policy or initiative bounded
- [ ] Agency's core misconception hypothesis documented
- [ ] Compliance type (Voluntary vs Mandatory) established
- [ ] Decision map outcome actions recorded for the Communications Team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Electoral Threat:** If opposition to the policy is so severe that citizens explicitly state they will organize to vote the sponsor out of office, this triggers **Civic & Public: Voter Sentiment**.

## Inbound bridging nodes
When Policy Perception is added as a secondary domain:
- `BRIDGE-cppp-mibt-narrative-adoption` (Activated when added to Trend & Behavior to measure how quickly a new policy narrative meme is spreading through a specific demographic)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If you had to summarize the policy in exactly five words, what would it be?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-cppp-*` node to establish the ultimate 'Simplicity Baseline'. If the agency cannot summarize their own law in 5 words, the Conducting agent assumes massive public confusion.
