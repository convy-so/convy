---
name: Durability & Materials Research (Creation)
description: Briefing agent skill for designing Durability & Materials Research. Guides the Creation agent to extract a complete, validated research brief focusing on long-term wear, environmental stress, and catastrophic failure modes.
id: pp-durability-materials-creation
version: 1.0.0
---

# Section 1: Domain Identity
Durability & Materials Research answers the question: *How long does this take to break in the real world?* Product testing labs can simulate 10,000 hinge-opens in a sterile environment, but they cannot simulate a toddler dropping a tablet onto a tile floor. This domain is usually executed longitudinally (e.g., after 3, 6, and 12 months of use) to measure material degradation, aesthetic wear-and-tear, and the specific environments that cause catastrophic failure.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Which specific components degrade or look 'cheap' after 90 days of use
- The environmental conditions (heat, moisture, dirt) that cause the most damage
- Whether aesthetic wear (scratches/patina) decreases the user's perceived value of the item
- How catastrophic failures actually occurred in the wild

**Cannot answer:**
- Initial unboxing impressions (requires Physical Concept Testing)
- Whether the instruction manual is clear (requires Usage & Performance)

# Section 3: Brief Interrogation Guide
**The Timeline Perimeter:**
- How long have the respondents been actively using the product? (The brief must clearly document the timeline. Surveying someone about 'durability' on Day 2 of ownership is useless data).
- Is this a one-time audit, or part of a longitudinal diary study?

**The Environmental Reality:**
- What extreme conditions (e.g., left in a hot car, washed in a dishwasher, exposed to salt water) does the client specifically want tested?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research reveals that the paint chips off after three weeks of normal use, will the client increase the tooling budget for anodized aluminum?
- If the product physically breaks, will the client honor the warranty or blame the user?

**Well-formed decision map example:**
> Durability outcome: If the battery hinge breaks for more than 15% of the beta cohort under normal use, manufacturing will be delayed to redesign the hinge. If the failure is purely cosmetic (minor scuffing), the product will launch on time with updated warranty language.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Aesthetic Wear & Tear | 20% | Root | 0.85 |
| Structural Degradation | 25% | Root | 0.85 |
| Environmental Stressors | 20% | Root | 0.80 |
| Catastrophic Failure Modes | 20% | Root | 0.80 |
| Maintenance & Cleaning Friction | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Care Axis: The brief must mix individuals who "baby" their products (The 'Mint Condition' user) with individuals who actively abuse them (The 'Heavy Duty' user) to find the actual threshold of durability.

# Section 7: Constitutional Constraints
1. **The Safety/Liability Wall.** If the product failure resulted in physical harm to a human or property damage (e.g., a battery caught fire), the AI must immediately pivot to the client's mandatory legal reporting protocol, pausing standard survey rules.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| 30-Day Cosmetic Check-In | Low | 10–15 mins |
| 6-Month Structural Audit | Moderate | 15–20 mins |
| Post-Mortem (The item broke) | High | 20–30 mins |

# Section 9: Handoff Checklist
- [ ] Product tenure (time in user's possession) established
- [ ] Specific environmental extremis defined
- [ ] Liability/Safety flag protocol registered
- [ ] Decision map outcome actions recorded for warranty/manufacturing
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Brand betrayal:** If the product breaking causes the user to swear they will never buy anything from the company again, this bleeds into **Market Intelligence: Brand Perception**.

## Inbound bridging nodes
When Durability & Materials is added as a secondary domain:
- `BRIDGE-ppdm-ppup-degraded-usage` (Activated when added to Usage & Performance to see if the product technically still works, but is so beaten up that the user hates using it)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"Approximately how many days, weeks, or months has it been since you first took this product out of its box?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-ppdm-*` node to establish longitudinal degradation curves.
