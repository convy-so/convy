---
name: Packaging & Presentation Research (Creation)
description: Briefing agent skill for designing Packaging & Presentation Research. Guides the Creation agent to extract a complete, validated research brief focusing on the unboxing experience, brand storytelling, and opening friction.
id: pp-packaging-presentation-creation
version: 1.0.0
---

# Section 1: Domain Identity
Packaging & Presentation Research measures the absolute first moment of truth for a physical product: The Unboxing. Before the user ever touches the actual product, they touch the box. This domain evaluates whether the packaging successfully elevates the perceived value of the product (the "Apple effect"), whether it communicates the brand story effectively, and whether the physical act of opening it is intuitive or aggressively frustrating (e.g., clamshell plastic).

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- If the packaging makes a $50 product feel like a $100 product (or vice versa)
- Whether the sustainability of the packaging aligns with the target audience's values
- If the required protective shipping materials interfere with the premium feel
- The level of frustration or excitement generated specifically by the opening mechanism

**Cannot answer:**
- How the actual product works once the box is discarded (requires Usage & Performance)
- Whether the marketing campaign leading up to the purchase was effective (requires Brand Perception)

# Section 3: Brief Interrogation Guide
**The Retail vs Direct-to-Consumer Context:**
- Is the packaging designed to sit on a crowded retail shelf (where it must scream for attention), or is it being shipped directly to a buyer's home (where it can be minimal and experiential)? The AI must establish the intended distribution channel to frame the research correctly.

**The Sustainability Reality:**
- Is the client testing a shift to sustainable/recycled packaging? (If yes, the brief must explicitly test if the new, rougher cardboard lowers the perceived premium value of the product).

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research reveals that users hate the excessive use of plastic wrap, will the client eliminate it and risk higher shipping damages?
- If the premium "magnetic closure" box is universally loved but costs $3 more to manufacture, will the client absorb the margin hit or pass it to the consumer?

**Well-formed decision map example:**
> Packaging outcome: If the baseline unboxing experience fails to register a 'Premium' emotional rating, the packaging team will approve the budget for soft-touch lamination on the outer sleeve. If respondents universally cite the internal zip-ties as overly frustrating, manufacturing will switch to paper twist-ties.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Initial Visual Impact & Anticipation | 20% | Root | 0.85 |
| Perceived Value (The 'Premium' Check) | 20% | Root | 0.80 |
| The Unboxing Mechanics (Friction) | 25% | Root | 0.85 |
| Brand Story & Labeling Clarity | 20% | Root | 0.80 |
| Sustainability & Waste Perception | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Gift-Giver vs The Pragmatist: The brief must ask whether this product is heavily gifted (where packaging is crucial) or a utilitarian self-purchase (where packaging is an annoyance). Gifting heavily skews packaging tolerance.

# Section 7: Constitutional Constraints
1. **The 'Zero Product' Mandate.** The brief must explicitly remind the Conducting module to constrain its questions to the box and the unboxing process. The AI must violently reject the respondent's attempt to review the actual product inside the box.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Graphic/Label Clarity A/B Test | Low | 10–15 mins |
| Standard Unboxing Experience | Moderate | 15–20 mins |
| Luxury / High-Friction Unboxing | High | 20–30 mins |

# Section 9: Handoff Checklist
- [ ] Distribution context (Retail vs D2C) established
- [ ] Primary packaging objective designated (e.g., Sustainability vs Luxury)
- [ ] 'Zero Product' constraint enforced in the state machine
- [ ] Decision map outcome actions recorded for materials budget
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **The 'Broken in Transport' trigger:** If the packaging failed to protect the product and it arrived shattered, this signals a need for a massive redesign, shifting partially to **Physical Product: Durability & Materials**.

## Inbound bridging nodes
When Packaging & Presentation is added as a secondary domain:
- `BRIDGE-pppp-mipt-price-justification` (Activated when added to Proposition Testing to see if adding luxury packaging actually increases the price the consumer is willing to pay)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"Is this product designed primarily to be purchased for oneself, or is it frequently purchased to be given as a gift?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-pppp-*` node to set the baseline tolerance for complex, layered unboxing mechanics.
