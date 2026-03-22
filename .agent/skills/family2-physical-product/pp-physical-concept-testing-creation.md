---
name: Physical Concept Testing Research (Creation)
description: Briefing agent skill for designing Physical Concept Testing. Guides the Creation agent to extract a complete, validated research brief focusing on form factor, initial physical appeal, and unboxing reactions before mass manufacturing.
id: pp-physical-concept-testing-creation
version: 1.0.0
---

# Section 1: Domain Identity
Physical Concept Testing is the bridge between a digital rendering and mass production. Before a client commits millions of dollars to tooling and manufacturing lines, they need to know if the physical manifestation of an idea works in the real world. This domain focuses heavily on first impressions, form factor, perceived value, and obvious design flaws when a user holds a prototype in their hands for the first time.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Does the physical shape and weight of the product align with the brand promise?
- Is the form factor intuitive, or does it require immediate instruction?
- What is the perceived "willingness to pay" based solely on holding the product?
- What are the immediate ergonomic red flags?

**Cannot answer:**
- Long-term wear and tear after six months of use (requires Durability & Materials)
- Brand perception disconnected from the physical product itself (requires Market Intelligence)

# Section 3: Brief Interrogation Guide
**The Prototype Fidelity:**
- What level of prototype is the user interacting with? (Is it a rough 3D-printed grey box, a non-functional 'looks-like' model, or a fully functional beta unit?) The AI must anchor its questions to the prototype's limitations.

**The Modality of Testing:**
- Are users evaluating the product in a controlled testing facility, or has it been mailed to their home for an "unboxing" test?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If users identify a major ergonomic flaw that makes the product uncomfortable to hold, will the client delay the launch to re-tool, or push forward?
- If the concept is perceived as "cheap" based on its weight, will the client increase the material cost or lower the MSRP?

**Well-formed decision map example:**
> Concept outcome: If the perceived value of the prototype is lower than the target MSRP, R&D will swap the plastic casing for aluminum. If the form factor is deemed confusing on first sight, Marketing will increase the budget for instructional unboxing materials.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Initial Reaction & Aesthetics | 25% | Root | 0.85 |
| Ergonomics & Form Factor | 20% | Root | 0.80 |
| Intuitive Interaction | 20% | Root | 0.80 |
| Perceived Value & Quality | 20% | Root | 0.80 |
| Missing Expectations | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Early Adopter Expectations: Physical prototypes often look rough. The brief must ensure the target audience consists of people who can look past minor cosmetic flaws in early models and focus on the core utility and form factor.

# Section 7: Constitutional Constraints
1. **The 'Imagination Gap' Reality.** The brief must explicitly state to the Conducting agent whether the respondent is required to "imagine" certain features working (e.g., "The screen doesn't turn on in this model, so ask them what they *expect* it to do").

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Rapid Reaction (Aesthetics Only) | Low | 10–15 mins |
| Form & Function Beta Walkthrough | Moderate | 20–25 mins |
| Complex Hardware Configuration | High | 25–35 mins |

# Section 9: Handoff Checklist
- [ ] Fidelity of the prototype explicitly defined
- [ ] Testing environment (Lab vs Home) established
- [ ] Specific "imagination requirements" (non-functional parts) noted
- [ ] Decision map outcome actions recorded for tooling/manufacturing
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Taste/Smell Dominance:** If the "physical concept" is entirely consumed via mouth or nose rather than operated by hands, this immediately shifts to **Physical Product: Sensory Evaluation**.

## Inbound bridging nodes
When Physical Concept Testing is added as a secondary domain:
- `BRIDGE-pppc-ppup-friction-preview` (Activated when added to Usage & Performance to see if initial form-factor complaints actually translated into long-term usage friction)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What material is the primary casing/body of this prototype currently made of?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-pppc-*` node to establish baseline expectations for weight and temperature.
