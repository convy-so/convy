---
name: Platform Ecosystem Research (Analytics)
description: Analytics agent skill for interpreting Platform Ecosystem Research. Focuses on mapping tech-stack dependencies, calculating structural churn walls, and identifying shadow competitors.
id: dp-platform-ecosystem-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Ecosystem data reveals the company's true "Moat." If a software product is standalone, its moat is small; a competitor can easily copy the features. If a software product is deeply integrated into 15 other workflows (billing, HR, sales, marketing), its moat is massive; tearing it out requires organizational surgery. The Analytics agent must synthesize the transcripts to determine exactly how deep the client's hooks go into the user's business, and whether those hooks generate loyalty or resentment.

# Section 2: Coverage Interpretation Guide
**The Ecosystem Matrix:**
- Deep Integration, High Satisfaction (The Hub): The ideal state. The platform is the beloved center of operations.
- Deep Integration, High Resentment (The Hostage): A highly profitable but fragile state. Users are trapped by the tech-stack but actively hate the vendor.
- Shallow Integration, High Satisfaction (The Utility Tool): A great product, but easily swappable.
- Shallow Integration, High Resentment (The Churn Risk): Will be canceled before the end of the quarter.

# Section 3: Quality Weighting Rules
**The 'Shadow Competitor' Multiplier:** If transcripts reveal that users are installing third-party marketplace apps to perform functions that the client's own native software is *supposed* to do, this data is weighted at 4x. It is definitive proof that the native feature is failing.

# Section 4: Benchmark Context
**The API Tax:** If analyzing Developer transcripts, the Analytics agent must calculate the "API Tax"—the amount of unpaid engineering hours third-party developers waste trying to navigate the client's undocumented or badly designed endpoints. A high API Tax kills a developer ecosystem.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Audience (Developer vs End-User), Primary integrations evaluated.
**Section 2: Executive Summary**
The definitive diagnosis of the Ecosystem Moat (Hub, Hostage, Utility, or Churn Risk).
**Section 3: The 'Dealbreaker' Dependency Map**
A prioritized list of the integrations that are singlehandedly keeping users on the platform.
**Section 4: The Friction & 'Hostage' Report**
Analysis of trapped-data sentiment and the specific integration breakages driving it.
**Section 5: Decision Map Response**
Direct mapping to the API redesigns, partnership investments, or native feature builds requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze the "Exodus Catalyst." If 30% of "Hostage" respondents cite "Data Migration Tools entering the market" as the only thing that would make them leave, the Analytics agent must flag this to the C-Suite. The moment a competitor builds an automated import tool, the client will experience catastrophic churn.

# Section 7: Flagging and Limitation Language
**When the 'Hostage' pattern is detected:**
"Synthesis of the ecosystem data reveals a highly fragile 'Hostage' dynamic. [Percentage]% of respondents indicated severe dissatisfaction with the core platform, but remain active subscribers solely because migrating their historical data and rebuilding their third-party connections is deemed 'structurally impossible' or 'too expensive.' The client's retention metric is currently being artificially supported by this integration friction, not by product loyalty. We strongly advise treating this cohort as an immediate churn risk the moment a competitor introduces an automated migration service."
