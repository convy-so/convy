---
name: Formal Methodology Research (Creation)
description: Briefing agent skill for designing Formal Methodology Research. Guides the Creation agent to extract a complete, validated research brief focusing on peer review friction, reproducibility barriers, and publication pressure.
id: sr-formal-methodology-creation
version: 1.0.0
---

# Section 1: Domain Identity
Formal Methodology Research evaluates the "Business of Science." It focuses on the researchers themselves—academics, lab directors, and data scientists—as they navigate the heavily bureaucratic and fiercely competitive world of academic publishing and grant funding. This domain measures the friction of the scientific process: writing papers, securing grants, passing peer review, and maintaining lab resources. It treats the pursuit of knowledge as a highly stressful professional career path.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why early-career researchers are abandoning tenure-track positions for private industry
- The specific pain points of using a new academic journal submission portal
- How the pressure to "Publish or Perish" affects data collection choices
- The perceived fairness of the double-blind peer review process

**Cannot answer:**
- Whether a specific scientific hypothesis is correct (requires peer review)
- The medical ethics of a specific trial (requires R&D Ethics)

# Section 3: Brief Interrogation Guide
**The Institutional Context:**
- Is the target audience in 'Academia' (driven by grants/tenure) or 'Private Industry' (driven by product launches/patents)? The AI must branch the brief here; an academic's primary currency is citations, while an industry researcher's primary currency is speed to market.

**The "Methodology vs Outcome" Hypothesis:**
- Does the client want to measure how researchers feel about the *tools* they use (software, lab equipment) or the *system* they operate within (journals, funding bodies)?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your journal's submission portal takes an average of 4 hours to navigate, will you rebuild the portal, or do you view the friction as a necessary "quality filter"?
- If early-career researchers state they actively avoid applying for your grant because the reporting requirements are too burdensome, will you reduce the required paperwork?

**Well-formed decision map example:**
> Methodology outcome: If the data shows that Post-Docs view the peer review system as fundamentally biased against open-access datasets, the publishing company will launch a fast-tracked 'Data-Only' peer review tier. If the primary pain point for lab directors is writing grant renewals, the university will invest in an AI-assisted grant writing software license for all departments.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Bureaucracy & Funding Friction | 25% | Root | 0.85 |
| 'Publish or Perish' Career Anxiety | 20% | Root | 0.85 |
| Peer Review Trust & Perceived Bias | 20% | Root | 0.80 |
| Reproducibility & Data Integrity Pressure| 20% | Root | 0.80 |
| Institutional Support vs Isolation | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Idealistic Junior vs The Cynical Primary Investigator (PI): The brief must establish the respondent's career stage. The Junior wants to change the world; the PI just wants to make sure their lab doesn't run out of funding next month.

# Section 7: Constitutional Constraints
1. **The 'Subject Matter Expert' Boundary.** The AI must never validate a brief that asks Convy to debate the *content* of the user's research (e.g., asking a physicist to explain String Theory). Convy must strictly limit questioning to the *mechanics of how they do their job* (e.g., asking a physicist how hard it is to get a grant to study String Theory).

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Lab Software/Equipment Usability | Low | 15–20 mins |
| Journal Submission & Peer Review Audit | Moderate | 25–40 mins |
| Systemic Burnout/Tenure Track Meta-Study| High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Context (Academia vs Industry) bounded
- [ ] Focus (Tools vs System) documented
- [ ] Audience baseline (Junior vs PI) established
- [ ] Decision map outcome actions recorded for Institutions/Publishers
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Enterprise Software Failure:** If a researcher loves their job but explicitly hates the clunky procurement software they have to use to buy lab supplies, this shifts to **B2B Professional: Service Delivery**.

## Inbound bridging nodes
When Formal Methodology is added as a secondary domain:
- `BRIDGE-srfm-tbed-academic-burnout` (Activated when added to Education Innovation to determine if a university is losing its best professors because the research bureaucracy is destroying their desire to teach)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If you told a researcher that they could either have $50,000 in unrestricted funding tomorrow, or a guaranteed publication in Nature next week, which would they choose?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-srfm-*` node to establish the client's baseline assumption regarding the ultimate currency (Money vs Prestige) driving the target audience.
