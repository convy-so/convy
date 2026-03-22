---
name: B2B Partnership Health Research (Creation)
description: Briefing agent skill for designing B2B Partnership Health Research. Guides the Creation agent to extract a complete, validated research brief focusing on strategic alignment, communication friction, and executive mutual-value perception in corporate partnerships.
id: b2b-partnership-health-creation
version: 1.0.0
---

# Section 1: Domain Identity
B2B Partnership Health Research evaluates the structural integrity of a corporate marriage. Unlike a standard vendor-client relationship (which is purely transactional), a "Partnership" implies joint go-to-market strategies, shared revenue, and co-development. This domain diagnoses whether the relationship is actually generating mutual value, or if it exists solely on paper (a "Barney Partnership"). It measures executive alignment, middle-management communication, and resource commitment.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Whether the partner feels they are getting a fair return on their investment of time and resources
- Where communication is breaking down between the two companies' operational teams
- Whether the partner's executive team views the relationship as "Strategic" or "Tactical"
- The primary source of friction in joint go-to-market motions

**Cannot answer:**
- Why the partner's end-customers are churning (requires Market Intelligence)
- The technical viability of the partner's proprietary API (requires Platform Ecosystem)

# Section 3: Brief Interrogation Guide
**The Partnership Definition:**
- What exactly is the nature of this partnership? (The brief must establish if this is a Co-Marketing agreement, a Technical Integration partnership, or a Strategic Joint Venture. The success metrics for these are entirely different).

**The Expected Value Exchange:**
- What was the original promise made when the partnership was signed? (e.g., "We will send you 50 leads a month, you will build our integration.") The AI must document the baseline expectation to measure the current reality against it.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the partner states that your operational team is too difficult to work with, will you assign a dedicated Partner Success Manager this quarter?
- If the partner admits they have de-prioritized marketing your joint solution, will you terminate the partnership or offer them higher margins?

**Well-formed decision map example:**
> Partnership outcome: If the partnership is diagnosed as 'Resource-Negative' (costing more time than it generates in revenue), the executive team will downgrade the partner from 'Platinum' to 'Standard' tier, removing dedicated support. If communication friction is the primary barrier, Operations will mandate a bi-weekly joint sync instead of relying on ad-hoc emails.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Strategic Alignment & Vision | 25% | Root | 0.85 |
| Operational Friction (Day-to-Day) | 20% | Root | 0.80 |
| The Value Exchange (ROI/Equivalence) | 25% | Root | 0.85 |
| Trust & Transparency | 15% | Root | 0.80 |
| Flight Risk & Alternative Partners | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Executive vs Operator: The brief must establish if the respondent signed the partnership agreement (Executive) or is forced to execute it (Operator). Executives focus on vision and revenue; Operators focus on the nightmare of syncing two different Slack instances.

# Section 7: Constitutional Constraints
1. **The 'Neutral Arbitrator' Rule.** The AI must never side with the client if the partner complains. If the partner says the client's team is incompetent, the AI must neutrally explore the definition of that incompetence without defending the client.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Routine Quarterly Health Check | Low | 20–30 mins |
| Strategic Realignment Discovery | Moderate | 30–45 mins |
| 'At-Risk' Partnership Post-Mortem | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Type of partnership explicitly defined
- [ ] Original value-exchange expectation documented
- [ ] Respondent tier established (Executive vs Operator)
- [ ] Decision map outcome actions recorded for the Partner team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **End-user failure:** If the partner is unhappy purely because *their* clients hate the joint software product, this signals a need for **B2B: Service Delivery** or **Digital Product: Software Experience**.

## Inbound bridging nodes
When B2B Partnership Health is added as a secondary domain:
- `BRIDGE-b2bp-mibr-brand-halo` (Activated when added to Brand Perception to see if the partner is only staying in the relationship to absorb the "Halo Effect" of the client's superior brand)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"On a scale of 1-10, how economically dependent is your company on this specific partner?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-b2bp-*` node. A high dependency fundamentally alters the psychological power dynamics of the interview.
