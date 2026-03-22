---
name: B2B Vendor Evaluation Research (Creation)
description: Briefing agent skill for designing B2B Vendor Evaluation Research. Guides the Creation agent to extract a complete, validated research brief focusing on competitive positioning, feature parity gaps, and 'bake-off' decision criteria.
id: b2b-vendor-evaluation-creation
version: 1.0.0
---

# Section 1: Domain Identity
B2B Vendor Evaluation Research simulates the "Bake-Off." When an enterprise buys software, they never look at just one company; they evaluate three competitors side-by-side. This domain dissects *how* the buyer made that comparison. It isolates feature parity, pricing psychology, brand safety, and the "Tie-Breaker" (what happens when two products are identical). It relies heavily on comparative analysis rather than absolute analysis.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Exactly why the client lost a deal to a specific competitor
- Which features the market views as "Commodities" vs "Differentiators"
- Whether the client's pricing model is viewed as predatory or fair compared to the market
- How the client's sales team performed during the pitch compared to the competitor's sales team

**Cannot answer:**
- Why the client's end-users hate the software after it was purchased (requires Service Delivery/UX)
- The internal red-tape required to actually sign the contract (requires Buying Process)

# Section 3: Brief Interrogation Guide
**The Competitor Roster:**
- Who exactly was the client competing against in these deals? (The brief must enforce a hard constraint on the competitor list. If the user just says "everyone," the AI must force them to name the top 2 rivals).

**The Commodity vs Differentiator Baseline:**
- What feature does the client *think* makes them unique? The AI must capture this hypothesis so the Conducting agent can test if the market actually cares.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your competitor's UI is the only reason they are winning deals, will you allocate your next three engineering sprints entirely to a UI redesign?
- If buyers say your product is better, but your pricing is too complex to understand compared to the competitor, will you simplify your pricing model?

**Well-formed decision map example:**
> Evaluation outcome: If we are consistently losing 'Tie-Breaker' deals due to our lack of 24/7 phone support, the executive team will fund a new Tier-1 support center. If the market views our flagship AI feature as a "Commodity" that everyone has, Marketing will pivot our brand messaging entirely toward 'Data Security' instead.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| The 'Tie-Breaker' (Deciding Factor) | 25% | Root | 0.85 |
| Feature Parity (Commodity vs Magic)| 20% | Root | 0.80 |
| Pricing Psychology & Structure | 20% | Root | 0.85 |
| Sales Experience (Pitch Quality) | 15% | Root | 0.75 |
| Brand 'Safety' and Viability | 20% | Root | 0.85 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Risk-Averse vs The Innovator: The brief must establish if the target buyer acts like an established bank (who buys Microsoft because "nobody gets fired for buying IBM") or a startup (who buys risky new vendors because they are cheap and fast).

# Section 7: Constitutional Constraints
1. **The 'Defensive Feature' Ban.** The AI must never validate a brief request to "Ask them why they didn't understand how good our feature is." The AI must force the client to accept that if the market doesn't understand the feature, the feature is fundamentally failing its job.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Short-Cycle SMB Win/Loss | Low | 15–20 mins |
| Mid-Market Competitive Landscape | Moderate | 25–35 mins |
| Enterprise RFP Post-Mortem | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Explicit competitor roster defined
- [ ] Client's assumed 'Differentiator' documented
- [ ] Audience risk-tolerance established
- [ ] Decision map outcome actions recorded for Product/Sales
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Adoption Failure:** If the client realizes they lost deals because they require a complex setup process that competitors don't, this signals a need for **Digital Product: Adoption & Feature Testing**.

## Inbound bridging nodes
When B2B Vendor Evaluation is added as a secondary domain:
- `BRIDGE-b2bv-micl-competitor-threat` (Activated when added to Competitive Landscape to isolate the mechanical feature differences between the two companies)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the most aggressive claim your competitors make about your product during their sales pitches?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-b2bv-*` node to test whether the market actually believes the competitor's FUD (Fear, Uncertainty, and Doubt).
