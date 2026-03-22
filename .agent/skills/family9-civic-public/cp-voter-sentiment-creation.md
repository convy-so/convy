---
name: Voter Sentiment Research (Creation)
description: Briefing agent skill for designing Voter Sentiment Research. Guides the Creation agent to extract a complete, validated research brief focusing on electoral enthusiasm, candidate trust, and issue-based voting behavior.
id: cp-voter-sentiment-creation
version: 1.0.0
---

# Section 1: Domain Identity
Voter Sentiment Research is not a traditional quantitative poll (which asks *who* you will vote for); it is a qualitative autopsy of *why* you will vote for them. This domain focuses on the emotional calculus of the electorate. It measures enthusiasm gaps, the effectiveness of negative attack ads, and the core issues driving voter turnout. It treats a candidate or a ballot measure as a "Product" and the voter as the ultimate "Buyer" who only gets to make a purchase once every few years.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic is "undecided" despite knowing both candidates well
- Whether an attack ad actually changed minds, or just made everyone angry
- What specific issue (e.g., economy, safety) is the absolute dealbreaker for a cohort
- The "Enthusiasm Gap" (will they actually show up to vote, or just answer polls positively)

**Cannot answer:**
- Creating a statistically valid prediction of the final vote count (requires Quantitative Polling)
- How to redesign the physical voting machines (requires Physical Product)

# Section 3: Brief Interrogation Guide
**The Electoral Context:**
- Is this research for a Candidate (Candidate A vs Candidate B) or an Issue (Prop 22: Yes vs No)? The AI must branch the brief immediately, as people vote for humans very differently than they vote for laws.

**The "Persuadable Universe":**
- Who exactly is the target audience? The AI must ensure the client isn't wasting time interviewing hardened partisans who will never change their minds. The focus must remain on the "Persuadable" or "Low-Propensity" voter.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research shows that your economic message is utterly failing to connect with working-class voters, will you change your platform, or just buy more ads pushing the identical platform?
- If voters state they agree with the candidate's policies but find the candidate personally untrustworthy, will you pivot the campaign heavily to character-defense?

**Well-formed decision map example:**
> Campaign outcome: If the data shows that the attack ad regarding the candidate's voting record is successfully peeling off independent women, the campaign will allocate $2M to counter-messaging specifically on daytime television. If the primary driver of "undecideds" is simple lack of name recognition, the campaign will shift budget from negative attacks to positive biographical introductions.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Issue Prioritization (The Dealbreaker) | 25% | Root | 0.85 |
| Candidate/Issue Trust & Authenticity | 20% | Root | 0.85 |
| Enthusiasm & Turnout Propensity | 20% | Root | 0.80 |
| Narrative & Attack Ad Susceptibility | 20% | Root | 0.80 |
| The "Change vs Status Quo" Desire | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Base vs The Swing: The brief must establish if the survey is meant to "Fire up the Base" (measure maximum enthusiasm) or "Win the Middle" (measure compromise and moderation).

# Section 7: Constitutional Constraints
1. **The 'Push Poll' Ban.** The AI must never allow the client to design the brief as a "Push Poll" (e.g., "Ask them if they would still vote for him if they knew he kicked a dog"). The AI must force the research to remain objective observation, not targeted voter manipulation under the guise of research.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Post-Debate Reaction Flash Poll | Low | 15–20 mins |
| Mid-Campaign Vulnerability Audit | Moderate | 25–35 mins |
| Deep-Dive "Swing Voter" Persona | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Electoral Context (Candidate vs Issue) established
- [ ] Target audience (Base vs Swing) defined
- [ ] Key attack narratives to test documented
- [ ] Decision map outcome actions recorded for the Campaign Manager
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Institutional Cynicism:** If voters refuse to answer questions about the candidates because they believe the entire election system is rigged or useless, this triggers an urgent pivot to **Civic & Public: Community Trust**.

## Inbound bridging nodes
When Voter Sentiment is added as a secondary domain:
- `BRIDGE-cpvs-cpct-incumbent-drag` (Activated when added to Community Trust to see if hatred for the city government generally is going to ruin the specific re-election chances of the incumbent Mayor)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most terrifying thing your opponent could successfully convince the public is true about your campaign?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-cpvs-*` node to prepare the Conducting agent to hunt for the specific vulnerability the campaign is most afraid of.
