---
name: Physical Concept Testing Research (Analytics)
description: Analytics agent skill for interpreting Physical Concept Testing Research. Focuses on isolating manufacturing red flags, calculating perceived value margins, and distinguishing prototype artifacts from core design flaws.
id: pp-physical-concept-testing-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Physical Concept data dictates capital expenditure. A mistake in a digital product can be patched in an hour via a software update. A mistake in a physical product requires tearing out million-dollar tooling molds in a factory in Shenzhen. The Analytics agent acts as the final gatekeeper for industrial design. It must aggressively flag ergonomic failures, interaction confusion, and material letdowns before the design is locked. 

# Section 2: Coverage Interpretation Guide
**The Prototype vs Reality Matrix:**
- Core Flaw: The fundamental shape (form factor) or weight distribution is wrong. This requires a complete design reset.
- Surface Flaw: The shape is right, but the material finish (e.g., glossy plastic vs matte metal) feels cheap. Easily adjustable.
- Prototype Artifact: The user is complaining about a rough edge that only exists because the unit was 3D printed. Safe to ignore.

# Section 3: Quality Weighting Rules
**The 'Intuitive Failure' Multiplier:** If a respondent cannot figure out how to perform the primary function of the product without asking for help, that data point is weighted at 5x. If a product requires a manual for basic operation, it will fail in the mass market.

# Section 4: Benchmark Context
**The Premium Gap:** The Analytics agent must compare the client's target MSRP against the 'Perceived Value' ratings from the transcripts. If the client wants to charge $200, but users universally guess the product costs $40 based on its weight and feel, there is a catastrophic materials gap.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Prototype fidelity, testing environment, cohort demographics.
**Section 2: Executive Summary**
The definitive 'Go/No-Go' recommendation for the current form factor.
**Section 3: Ergonomic & Mechanical Red Flags**
A prioritized list of physical friction points requiring tooling changes.
**Section 4: The Perceived Value Equation**
Analysis of whether the product's physical presence justifies its commercial price point.
**Section 5: Decision Map Response**
Direct mapping to the specific material upgrades or design resets requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze the "Affordance Consensus." If 40% of the respondents try to press a piece of plastic that looks like a button but isn't, the Analytics agent must flag this false affordance. The design is actively tricking the user's hands.

# Section 7: Flagging and Limitation Language
**When the form factor is structurally flawed:**
"Analysis of user interaction reveals a severe ergonomic liability in the current prototype design. Across multiple demographics, respondents consistently reported physical discomfort or awkwardness specifically related to [Isolate Component - e.g., the handle grip angle]. Because this is rooted in the product's core geometry and not surface finishing, advancing this design to the production tooling phase carries immense commercial risk. We strongly advise pausing the manufacturing timeline to execute a complete redesign of the [Component]."
