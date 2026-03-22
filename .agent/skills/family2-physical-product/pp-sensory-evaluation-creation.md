---
name: Sensory Evaluation Research (Creation)
description: Briefing agent skill for designing Sensory Evaluation Research. Guides the Creation agent to extract a complete, validated research brief focusing on taste, smell, sound, and visual appeal for consumable or experiential products.
id: pp-sensory-evaluation-creation
version: 1.0.0
---

# Section 1: Domain Identity
Sensory Evaluation Research is the science of human perception. Unlike Usage & Performance (which measures if a product *works*), Sensory Evaluation measures if a product is *pleasing* to consume or experience. It is the primary domain for food, beverage, cosmetics, and acoustic engineering. It requires absolute isolation of variables (e.g., separating the taste of the liquid from the color of the bottle) to determine the exact sensory drivers of preference.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Which specific flavor or scent profile is preferred by the target demographic
- The perceived intensity and duration of a sensory experience (the 'aftertaste' or 'dry down')
- Whether a cheaper ingredient formulation is noticeably different to the consumer (triangle testing)
- The emotional association triggered by a specific sound or smell

**Cannot answer:**
- The ergonomic comfort of the product's packaging (requires Physical Concept Testing)
- Whether the respondent will actually buy the product in a store (requires Proposition Testing)

# Section 3: Brief Interrogation Guide
**The Sensory Perimeter:**
- Which specific senses are being evaluated? (The AI must force the client to prioritize. E.g., "Are we testing the *smell* of the lotion, the *texture* of the lotion, or both?")
- Is this a "Monadic test" (evaluating one product in isolation) or a "Sequential test" (comparing Product A vs Product B)?

**The Environmental Protocol:**
- Will the respondents test the product "Blind" (unbranded packaging) or "Branded"? If Branded, the AI must flag that sensory feedback will be heavily skewed by brand bias.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research reveals that the "new and improved" formula is rated lower in taste than the original formula, will R&D revert the change?
- If the cheaper, cost-saving fragrance is noticeable to 40% of users, is that an acceptable threshold for the client?

**Well-formed decision map example:**
> Sensory outcome: If the new formula beats the incumbent competitor by exactly 10 points in 'Overall Liking,' it will proceed to mass production. If it fails to show a statistically significant preference over the current formula, it will be sent back to the flavor lab for reformulation.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Initial Impact (The First Bite/Sniff) | 25% | Root | 0.85 |
| Profile & Complexity | 20% | Root | 0.80 |
| Texture / Mouthfeel / Application | 20% | Root | 0.80 |
| The Finish (Aftertaste / Dry Down) | 15% | Root | 0.75 |
| Overall Liking & Preference | 20% | Root | 0.85 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Palate Sophistication: The brief must establish if the respondents are "Heavy Category Users" (who have highly developed palates for the product) or "Category Novices" (who will likely just rate everything as "sweet").

# Section 7: Constitutional Constraints
1. **The Sequential Neutrality Rule.** If the brief requires testing Product A and Product B together, the AI must explicitly document the "Palate Cleansing" rules and ensure the order of testing is randomized to prevent sequence bias.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Single Product 'Quick Sniff/Taste' | Low | 10–15 mins |
| A/B Comparative Testing | Moderate | 20–25 mins |
| Complex Multi-Sensory Profiling | High | 25–35 mins |

# Section 9: Handoff Checklist
- [ ] Primary senses under evaluation defined
- [ ] Monadic vs Sequential testing framework established
- [ ] Blind vs Branded testing conditions documented
- [ ] Decision map outcome actions recorded for formula finalization
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Packaging frustration:** If the respondent spends the entire sensory interview complaining that they couldn't get the cap off the bottle, this flags **Physical Product: Packaging & Presentation**.

## Inbound bridging nodes
When Sensory Evaluation is added as a secondary domain:
- `BRIDGE-ppse-mipt-sensory-conversion` (Activated when added to Proposition Testing to see if a fantastic sensory experience overcomes a terrible physical price point)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"Are the respondents evaluating this product entirely blind (unmarked packaging), or do they know what brand made it?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-ppse-*` node to account for cognitive brand bias.
