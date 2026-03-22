---
name: B2B Reseller & Channel Research (Creation)
description: Briefing agent skill for designing B2B Reseller & Channel Research. Guides the Creation agent to extract a complete, validated research brief focusing on margin structure, sales enablement, and channel conflict.
id: b2b-partnership-reseller-creation
version: 1.0.0
---

# Section 1: Domain Identity
B2B Reseller & Channel Research evaluates the "Middlemen." This domain focuses on the third-party agencies, managed service providers (MSPs), VARs (Value-Added Resellers), and brokers who sell the client's product on their behalf. Channel sales are entirely driven by margin, ease of sale, and enablement. This domain answers the question: *Why is our reseller pitching our competitor's product instead of ours to their book of business?*

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Whether the financial incentives (margins, spiffs, rebates) are actually competitive
- If the partner portal and sales collateral are actually useful to the reseller's sales reps
- The severity of "Channel Conflict" (is the client's direct sales team stealing leads from the reseller)
- How the reseller positions the client's product vs. competitors in their portfolio

**Cannot answer:**
- Why the end-customer ultimately churned after the reseller sold the product (requires Service Delivery/Market Intel)
- The technical deep-dive of the API required for the integration (requires Platform Ecosystem)

# Section 3: Brief Interrogation Guide
**The Reseller Perimeter:**
- Who exactly is the target audience? (e.g., The Owner of the agency who sets the strategy, or the specific Sales Rep at the agency who is failing to hit quote on the client's product?) The AI must branch the brief, as owners care about margin, while reps care about ease-of-sale.

**The Competitor Baseline:**
- What are the top two other products this reseller sells? The AI must establish the baseline standard the client is being held against.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If research proves that your partner portal is too difficult to navigate to register a deal, will you invest in a new PRM (Partner Relationship Management) system?
- If resellers complain that your direct sales team is stealing their deals (Channel Conflict), will you fire the direct sales reps, or rewrite the rules of engagement?

**Well-formed decision map example:**
> Channel outcome: If Channel Conflict is identified as the primary reason resellers are abandoning the program, the executive team will implement a strict 'Channel-First' lead routing policy for accounts under 500 employees. If the primary blocker is 'Lack of Enablement,' marketing will allocate $100k to build a co-branded pitch deck generator for the partner portal.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Financial Incentives (Margin/Rebates)| 25% | Root | 0.85 |
| Sales Enablement (Collateral/Training)| 20% | Root | 0.80 |
| Channel Conflict & Deal Registration | 20% | Root | 0.85 |
| Product Portfolio Positioning | 20% | Root | 0.80 |
| Vendor Support (Responsiveness) | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Portfolio Mercenary: Resellers are rarely loyal. They sell what makes them the most money with the least friction. The AI must instruct the Conducting agent to approach the respondent not as a loyal friend, but as a ruthless mercenary allocating limited sales resources.

# Section 7: Constitutional Constraints
1. **The 'End-User' Ban.** The AI must explicitly instruct the Conducting agent not to accidentally shift the interview into asking how the *reseller* uses the product. The reseller doesn't use it; they sell it. The questions must remain focused on the mechanics of *selling*.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Channel Program Health/NPS Check | Low | 15–20 mins |
| Margin & Commission Structure Deep Dive | Moderate | 25–35 mins |
| Severe Channel Conflict / Flight Risk Audit | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Respondent role (Agency Owner vs Agency Rep) established
- [ ] Competitor baseline (who else do they sell) documented
- [ ] Financial structure context provided to the agent
- [ ] Decision map outcome actions recorded for Channel Leadership
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Product failure:** If the reseller refuses to pitch the product because their last 3 clients churned due to terrible onboarding, this flags an urgent need for **B2B: Service Delivery**.

## Inbound bridging nodes
When B2B Reseller & Channel is added as a secondary domain:
- `BRIDGE-b2br-mipt-discounting-pressure` (Activated when added to Pricing & Value to calculate if the reseller is unilaterally discounting the product just to hit their own quotas)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What percentage of this specific partner's total revenue comes from selling your product?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-b2br-*` node. A partner making 80% of their revenue from the client is a captive audience; a partner making 5% is a flight risk.
