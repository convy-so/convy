---
name: Durability & Materials Research (Analytics)
description: Analytics agent skill for interpreting Durability & Materials Research. Focuses on isolating manufacturing points of failure, differentiating patina from damage, and calculating the 'Time to Trash' metric.
id: pp-durability-materials-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Durability data defines the product's ultimate lifecycle and warranty liability. If an object is designed to last 3 years, but the transcripts reveal that the charging port degrades mechanically after 6 months, the client will face a wave of returns and a destroyed reputation. The Analytics agent must synthesize the forensic data gathered by the Conducting agent to identify specific, repeatable points of material failure across the cohort, isolating whether the failure is a user-error anomaly or a systemic manufacturing flaw.

# Section 2: Coverage Interpretation Guide
**The Degradation Matrix:**
- Structural Failure (Normal Use): The worst-case scenario. The product broke while being used exactly as intended. High liability.
- Structural Failure (Abuse): The product broke because the user abused it. Identifies the "ceiling" of durability, but less urgent.
- Aesthetic Degradation (Negative): The product looks cheap and damaged quickly (e.g., peeling chrome plating).
- Aesthetic Degradation (Positive): The product "wears in" beautifully (e.g., heavy leather patina).

# Section 3: Quality Weighting Rules
**The 'Expected Lifecycle' Multiplier:** If a highly expensive, "premium" product shows visible degradation in 30 days, that insight is weighted at 4x. The gap between the price paid and the physical reality of the wear creates massive brand damage.

# Section 4: Benchmark Context
**The Environmental Consistency:** The Analytics agent must correlate failure modes with environmental stressors. If 90% of the hinge breakages happen to users who keep the product in a hot car, the problem is not mechanical force, it is material warp due to extreme heat.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Product lifecycle tested (e.g., 6-month check-in), cohort size.
**Section 2: Executive Summary**
The definitive diagnosis of the product's lifespan and warranty liability risk.
**Section 3: Structural Points of Failure**
A prioritized list of mechanical degradation (hinges, buttons, ports) mapped to usage patterns.
**Section 4: Aesthetic Wear Analysis**
How the product visually ages, and whether that aging is perceived as cheap (damage) or premium (patina).
**Section 5: Decision Map Response**
Direct mapping to the specific material upgrades or manufacturing changes requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Calculate the "Time to Trash" curve. If the transcripts reveal that by Month 9, the product works but looks so aggressively beaten up that 60% of users are hiding it in a drawer or considering replacing it, Month 9 is the true end of the product's lifecycle.

# Section 7: Flagging and Limitation Language
**When a systemic structural flaw is detected:**
"Synthesis of this longitudinal cohort reveals a critical, systemic failure in the [Specific Component]. Regardless of whether the user was classified as a 'Heavy Duty' abuser or a 'Mint Condition' careful user, [Percentage]% of the cohort reported the [Component] cracking or snapping between months 4 and 6 of ownership. This failure mode is not correlated with user abuse; it is a fundamental material weakness. We recommend an immediate warranty provision review and a material upgrade for this specific component in the next manufacturing run."
