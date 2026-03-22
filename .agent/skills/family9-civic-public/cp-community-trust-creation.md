---
name: Community Trust Research (Creation)
description: Briefing agent skill for designing Community Trust Research. Guides the Creation agent to extract a complete, validated research brief focusing on institutional credibility, transparency, and the social contract between citizens and government.
id: cp-community-trust-creation
version: 1.0.0
---

# Section 1: Domain Identity
Community Trust Research evaluates the "Social Contract." Unlike Citizen Service (which measures mechanical transactions like renewing a license), Community Trust measures sweeping institutional authority. Do citizens believe the Police Department is actually keeping them safe? Do they believe the Mayor's office is distributing funding fairly? This domain operates at the macro-level of civic engagement. It isolates the drivers of public cynicism, the impact of local scandals, and the perceived transparency of public institutions.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific neighborhood feels ignored by city leadership
- Whether a recent public scandal permanently damaged the institution's credibility
- The perceived fairness of resource allocation (e.g., funding for parks vs police)
- Whether the community believes official government messaging/data

**Cannot answer:**
- How hard it is to fill out a specific zoning permit (requires Citizen Service)
- How a citizen intends to vote in the next specific election (requires Voter Sentiment)

# Section 3: Brief Interrogation Guide
**The Trust Catalyst:**
- What specific event, crisis, or chronic failure prompted this research? (e.g., "The water contamination scandal last year" or "A 10-year feeling of neglect in the South Ward"). The AI must anchor the trust breakdown to a specific catalyst.

**The Authority Figure:**
- Which specific institution or leader is being evaluated? (e.g., "The Public School Board" vs "The City Council"). The AI must establish exactly who the citizen is being asked to trust.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the community states they fundamentally do not believe the city's crime statistics, will you hire an independent third-party auditor, or just run a PR campaign?
- If trust in the Mayor's office is completely broken due to a lack of transparency, will you implement open-book civic budgeting?

**Well-formed decision map example:**
> Trust outcome: If the primary driver of cynicism is a perceived lack of transparency regarding police funding, the City Council will mandate a monthly public town hall specifically dedicated to the budget line-items. If the driver is a feeling of historic neglect in District 4, the Mayor will reallocate 15% of the infrastructure budget strictly to that district to prove commitment.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Institutional Transparency & Honesty | 25% | Root | 0.85 |
| Fairness of Resource Allocation | 20% | Root | 0.80 |
| Crisis Management & Accountability | 20% | Root | 0.85 |
| Perceived Competence of Leadership | 20% | Root | 0.80 |
| Baseline Community Cynicism | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Disenfranchised vs The Engaged: The brief must establish the baseline cynicism of the target cohort. Are we surveying the "Neighborhood Watch Captain" who attends every town hall, or the marginalized citizen who hasn't voted in 10 years because "they are all corrupt"?

# Section 7: Constitutional Constraints
1. **The 'Systemic Bias' Acknowledgment.** The AI must never validate a brief that assumes a lack of trust is the community's fault (e.g., "Ask them why they are so resistant to our great new initiatives"). The AI must force the client to assume the community's lack of trust is a logical reaction to historical institutional failure.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Routine Annual City-Wide Trust Index | Moderate | 20–30 mins |
| Post-Crisis Trust Recovery Audit | High | 30–45 mins |
| Deep-Dive Historic Disenfranchisement | Severe | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Trust catalyst (the event or chronic failure) established
- [ ] Specific target authority/institution defined
- [ ] Audience baseline cynicism calibrated
- [ ] Decision map outcome actions recorded for Civic Leadership
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Transactional Failure:** If the citizen's lack of macro-trust is entirely based on the fact that the garbage hasn't been picked up in three weeks, this requires an immediate fallback to **Civic & Public: Citizen Service** to fix the mechanical failure.

## Inbound bridging nodes
When Community Trust is added as a secondary domain:
- `BRIDGE-cpct-cppp-policy-cynicism` (Activated when added to Policy Perception to determine if a citizen hates a new policy simply because they fundamentally distrust the Mayor who proposed it)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If you had to guess, what percentage of the community believes your institution operates with hidden agendas?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-cpct-*` node to calibrate the respondent's defensive posture. High assumed hidden-agendas require the Conducting agent to rely almost entirely on "Trust Recovery Language" before asking core questions.
