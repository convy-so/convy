---
name: B2B Buying Process Research (Creation)
description: Briefing agent skill for designing B2B Buying Process Research. Guides the Creation agent to extract a complete, validated research brief focusing on committee dynamics, procurement friction, and the hidden veto in enterprise sales.
id: b2b-buying-process-creation
version: 1.0.0
---

# Section 1: Domain Identity
B2B Buying Process Research maps the labyrinth of enterprise procurement. Unlike B2C (where one person makes a snap decision based on emotion), B2B buying involves committees, budgets, legal reviews, and deep structural risk. This domain focuses entirely on the *mechanics of the purchase*: who holds the budget, who holds the veto, what external pressures trigger the search, and how long the sales cycle actually takes from inside the buyer's building.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- The exact timeline from "Identifying a problem" to "Signing a contract"
- The hidden stakeholders who possess "Veto Power" over a purchase
- The specific ROI metrics or security guarantees the CFO/Legal team demanded
- The internal friction experienced during the vendor onboarding process

**Cannot answer:**
- Whether the employees actually like using the software once it's bought (requires Software Experience)
- How the client's product compares feature-by-feature to the competitor (requires Vendor Evaluation)

# Section 3: Brief Interrogation Guide
**The Committee Audit:**
- Who exactly is the respondent? (The AI must explicitly establish if the respondent is the 'Champion' who wanted the product, the 'Economic Buyer' who paid for it, or the 'End User' who is forced to use it).

**The Catalyst Check:**
- What 'trigger-event' forced the company to start looking for a solution? (Enterprise companies do not buy software for fun; something broke, someone quit, or a law changed).

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If research proves that your sales cycle is 4 months longer than the industry average due to legal review, will you pre-emptively rewrite your standard MSA?
- If the primary 'Veto' comes from the client's IT Security team, will you invest in a SOC-2 certification this quarter?

**Well-formed decision map example:**
> Process outcome: If the primary procurement bottleneck is identified as 'Legal Redlining,' Sales Ops will implement a fast-track click-wrap agreement for contracts under $50k. If the 'Economic Buyer' vetoes the purchase 40% of the time late in the cycle, Marketing will build CFO-targeted ROI calculators for the Sales team to use in Month 1.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| The Catalyst (Trigger Event) | 20% | Root | 0.85 |
| The Committee (Roles & Vetoes) | 25% | Root | 0.85 |
| The Evaluation Criteria (Non-Negotiables) | 20% | Root | 0.80 |
| Procurement & Legal Friction | 20% | Root | 0.80 |
| Post-Sale Implementation Reality | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Internal Political Capital: B2B buying requires the 'Champion' to spend political capital to push a purchase through. The brief must understand how risky this purchase was for the respondent's personal career at their company.

# Section 7: Constitutional Constraints
1. **The 'Sales Pivot' Ban.** The AI must never attempt to "Handle Objections" or reverse a lost deal. If the respondent says "We didn't buy your product because it's too expensive," the AI must simply document it, never defend the pricing.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| SMB 'Credit Card' Purchase Audit | Low | 15–20 mins |
| Mid-Market Multi-Stakeholder Cycle | Moderate | 25–35 mins |
| Enterprise RFP / Legal Post-Mortem | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Respondent role (Champion, Buyer, User) established
- [ ] 'Win/Loss' context of the deal provided
- [ ] Expected length of the standard sales cycle documented
- [ ] Decision map outcome actions recorded for Sales Ops / Enablement
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Feature requirement:** If the deal was lost purely because the client lacked one specific feature, this signals a massive need for **B2B: Vendor Evaluation** or **Digital Product: Software Experience**.

## Inbound bridging nodes
When B2B Buying Process is added as a secondary domain:
- `BRIDGE-b2bb-mibr-brand-safety` (Activated when added to Brand Perception to calculate if the client's massive, safe brand reputation was the only reason the CFO approved the budget)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"Is this research focused on analyzing deals that your sales team WON, deals that they LOST, or a mix of both?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-b2bb-*` node to establish the psychological framing (Validating a success vs Post-mortem of a failure).
