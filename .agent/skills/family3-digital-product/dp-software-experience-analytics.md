---
name: Software Experience Research (Analytics)
description: Analytics agent skill for interpreting Software Experience Research. Focuses on isolating true product-market fit, distinguishing 'Aspirational' features from 'Critical' utility, and calculating structural churn risk.
id: dp-software-experience-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Software Experience data separates the "Marketing Roadmap" from the "Reality Roadmap." Product teams often spend millions developing features they think users want, only to find users ignore them. The Analytics agent must aggressively distinguish between "Stated Importance" (what users say is cool) and "Behavioral Utility" (what users actually log in to do). If a feature has high stated importance but zero behavioral utility, it is 'Clutter.' The Analytics agent's primary job is to tell the client what to build next, and more importantly, what to stop building.

# Section 2: Coverage Interpretation Guide
**The Utility Matrix:**
- High Utility, Low Friction: Core Product-Market Fit. Protect this at all costs.
- High Utility, High Friction: The "Sticky Trap." Users hate the process, but the outcome is so valuable they endure it. High risk of disruption by a cleaner competitor.
- Low Utility, Low Friction: The "Nice to Have." It works perfectly, but nobody cares. Stop investing budget here.
- Low Utility, High Friction: Toxic Clutter. Remove it from the product entirely.

# Section 3: Quality Weighting Rules
**The 'Export' Multiplier:** If transcripts reveal that users consistently export data out of the software (to Excel, PDF, or a competitor) to finish a task, this workflow failure is weighted at 4x. "Exporting" is the definitive behavioral proof that the software failed to solve the full problem.

# Section 4: Benchmark Context
**The 'Mandate' Filter:** The Analytics agent must bifurcate the data based on user volition. If Enterprise users are "Mandated" by their boss to use the software, their engagement metrics are artificially high. The Analytics agent must discount pure engagement volume and focus solely on the "Friction" and "Alternative Baseline" nodes to find true sentiment.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Software tested, user type demographics, core promise evaluated.
**Section 2: Executive Summary**
The definitive ruling on the software's true Product-Market Fit.
**Section 3: Feature Utilization Hierarchy**
Categorizing all discussed features into 'Critical,' 'Nice-to-Have,' and 'Toxic Clutter.'
**Section 4: The Workflow Gap Analysis**
Detailed mapping of where the software fails the user's daily routine (focusing on "Workarounds" and "Exports").
**Section 5: Decision Map Response**
Direct mapping to the specific roadmap pivots or feature investments requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze for the "Ghost Feature." If the client's brief specifically asked to test a new AI feature, but 80% of the transcripts show the Conducting agent having to forcefully remind the user that the feature even exists, the Analytics agent must explicitly flag this as an awareness/relevance failure.

# Section 7: Flagging and Limitation Language
**When the 'Sticky Trap' pattern is detected:**
"Synthesis of the workflow data reveals complete reliance on the [Core] module, but severe dissatisfaction with its execution. Respondents universally view this tool as mission-critical, meaning short-term churn is low. However, [Percentage]% of users explicitly noted the manual workarounds required to compensate for the lack of [Specific Integration/Feature]. This represents a highly fragile 'Sticky Trap' dynamic. The user base is held captive by the data lock-in, not by loyalty. We strongly advise that any competitor offering a streamlined alternative to this specific workflow will cause catastrophic automated migration."
