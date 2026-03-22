---
name: Usage & Performance Research (Creation)
description: Briefing agent skill for designing Usage & Performance Research. Guides the Creation agent to extract a complete, validated research brief focusing on functional utility, learning curves, and real-world friction for physical products.
id: pp-usage-performance-creation
version: 1.0.0
---

# Section 1: Domain Identity
Usage & Performance Research answers the most fundamental question of engineering: *Does it actually work as intended when a normal person uses it?* Unlike Concept Testing (which focuses on first impressions) or Sensory Evaluation (which focuses on pleasure), Usage & Performance is highly mechanical. It measures the utility, the learning curve, and the frustration inherent in achieving a specific task using the client's physical product in a real-world environment.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Exactly where the user gets "stuck" when trying to operate the product
- Whether the product actually solves the core problem it was designed for
- The clarity and necessity of the included instructions/manual
- Unintended or 'hacked' use-cases the user invented

**Cannot answer:**
- Long-term material degradation (requires Durability & Materials)
- The appeal of the unboxing experience (requires Physical Concept Testing or Packaging & Presentation)

# Section 3: Brief Interrogation Guide
**The Task Perimeter:**
- What is the *primary* task this product is supposed to accomplish? (The brief must anchor the research around a massive, undeniable core utility, e.g., "The vacuum must clean pet hair from a rug").
- What are the *secondary* features the client wants tested? 

**The Environmental Reality:**
- Where does this usage take place? (A power tool tested in a clean, well-lit lab yields entirely different data than a power tool tested in a dark, cramped residential basement).

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research reveals that users cannot figure out how to navigate the product's menu system, will you rewrite the software, or just rewrite the manual?
- If the core mechanism works, but the 'smart features' are entirely ignored by users, will you remove them to cut costs?

**Well-formed decision map example:**
> Performance outcome: If respondents successfully complete the primary task in under 2 minutes without the manual, the product will proceed to beta manufacturing. If 30% or more fail to execute the primary task, the physical interface will be redesigned.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Setup & Calibration | 15% | Root | 0.80 |
| Primary Task Execution | 30% | Root | 0.85 |
| Secondary Feature Utility | 15% | Root | 0.75 |
| The Learning Curve | 20% | Root | 0.80 |
| Unintended Friction | 20% | Root | 0.80 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Expertise Delta: The brief must establish if the respondents are "Experts" (who will evaluate the product against highly technical standards) or "Novices" (who will evaluate the product purely on ease-of-use).

# Section 7: Constitutional Constraints
1. **The 'Intervention' Rule.** The AI must explicitly define in the brief when the Conducting agent is allowed to "rescue" a frustrated user with instructions, and when it must simply document their total failure to operate the product.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Single Feature Optimization | Low | 15–20 mins |
| Standard Product 'First Use' | Moderate | 20–30 mins |
| Complex Machinery/Appliance | High | 30–45 mins |

# Section 9: Handoff Checklist
- [ ] Primary and Secondary tasks explicitly defined
- [ ] Testing environment established
- [ ] Expertise level of the cohort defined
- [ ] Decision map outcome actions recorded for interface/hardware redesign
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Packaging obstruction:** If the user spends the first 5 minutes of the interview unable to physically remove the product from the box, this flags **Physical Product: Packaging & Presentation**.

## Inbound bridging nodes
When Usage & Performance is added as a secondary domain:
- `BRIDGE-ppup-micl-feature-parity` (Activated when added to Competitive Landscape to see if the competitor's tool actually executes the same task faster)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most complicated or technically difficult step required to operate this product?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-ppup-*` node to anticipate maximum user friction.
