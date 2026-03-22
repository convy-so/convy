---
name: Banking Trust Research (Creation)
description: Briefing agent skill for designing Banking Trust Research. Guides the Creation agent to extract a complete, validated research brief focusing on financial anxiety, institutional credibility, and the adoption of new financial products.
id: fn-banking-trust-creation
version: 1.0.0
---

# Section 1: Domain Identity
Banking Trust Research evaluates the psychology of money. Financial institutions sell "safety" as their primary product. This domain measures how safe a customer actually feels, how much financial anxiety drives their decision-making, and what specific triggers cause them to abandon a legacy bank for a fintech startup. It treats a bank account not just as a mathematical ledger, but as a deeply emotional vault of security.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a demographic refuses to link their primary checking account to a new budgeting app
- What specific event caused a customer to close an account they held for 20 years
- Whether a bank's new aesthetic redesign feels "modern" or "insecure"
- The level of latent anxiety a customer feels regarding hidden fees

**Cannot answer:**
- Whether the login button on the mobile app is hard to find (requires Digital Product UX)
- How a customer allocates their 401k portfolio (requires Investment Behavior)

# Section 3: Brief Interrogation Guide
**The Trust Event:**
- Is the research proactive (testing a new product) or reactive (a post-mortem on a data breach or PR crisis)? The AI must anchor the brief to the specific event testing the institution's credibility.

**The Fintech Threat:**
- Who does the legacy institution view as their primary threat? The AI must map the specific competitive alternative (e.g., "Are we losing them to Chase, or are we losing them to CashApp?"). 

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that customers find your "overdraft protection" actively predatory, will you actually change the fee structure, or just rewrite the marketing copy?
- If younger demographics state they trust Apple/Google more than your legacy bank, will you prioritize third-party integrations over building your own proprietary wallet?

**Well-formed decision map example:**
> Trust outcome: If the primary driver of Gen-Z account closure is 'Hidden Fee Anxiety', the product team will launch a mandatory, zero-fee checking tier. If the primary driver is 'App Clunkiness compared to Venmo', the development budget will be instantly reallocated from physical branch maintenance to P2P mobile transfer features.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Institutional Safety & Credibility | 25% | Root | 0.85 |
| Financial Anxiety & Fee Transparency | 25% | Root | 0.85 |
| Digital UX vs Physical Branch Need | 20% | Root | 0.80 |
| Switching Friction (The Moat) | 15% | Root | 0.75 |
| Fintech Adoption Comfort | 15% | Root | 0.80 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Generational Saver vs The Digital Nomad: The brief must establish the respondent's baseline definition of money. Do they think of money as physical cash in a vault, or digital numbers moving between APIs?

# Section 7: Constitutional Constraints
1. **The 'Financial Literacy' Trap.** The AI must never validate a brief that assumes customers are churning simply because they are "not financially literate enough" to understand the products. The AI must force the client to assume that if a product is perfectly logical but emotionally terrifying, the product is a failure.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| New Digital Feature 'Safety' Check | Low | 15–20 mins |
| Competitor Defection (Churn) Autopsy | Moderate | 25–40 mins |
| Generational Trust Meta-Analysis | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Trust event (Proactive vs Reactive) bounded
- [ ] Competitive threat (Legacy vs Fintech) documented
- [ ] Audience baseline (Physical vs Digital) established
- [ ] Decision map outcome actions recorded for Product/Exec Team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Transactional Failure:** If the user loves the bank's brand but the specific mobile deposit feature crashes every week, this requires an immediate fallback to **Digital Product: Usability & UX**.

## Inbound bridging nodes
When Banking Trust is added as a secondary domain:
- `BRIDGE-fnbt-cplo-fee-resentment` (Activated when added to Loyalty & Rewards to see if the user views the "Points" they earn as totally invalidated by the "Hidden Fees" they pay)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your bank accidentally double-charged a customer $50, do you believe the customer assumes it was a computer glitch, or intentional theft?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-fnbt-*` node to calibrate the respondent's baseline defensive posture against the institution.
