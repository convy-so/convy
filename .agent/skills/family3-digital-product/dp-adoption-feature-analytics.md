---
name: Adoption & Feature Testing Research (Analytics)
description: Analytics agent skill for interpreting Adoption & Feature Research. Focuses on isolating the 'Setup Tax', analyzing discoverability failure, and determining if a feature is worth saving.
id: dp-adoption-feature-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Adoption data is the autopsy of product launches. Features fail for one of three reasons: users don't know it exists (Awareness), users can't figure out how to start using it (The Setup Tax), or users just don't care (Null Utility). The Analytics agent must aggressively separate these three failure modes. A feature with 'Null Utility' should be killed. A feature with high utility but a massive 'Setup Tax' should be redesigned. The Analytics agent prevents the client from deleting good features that were just marketed poorly.

# Section 2: Coverage Interpretation Guide
**The Adoption Matrix:**
- High Awareness, High Setup Tax: The feature is desired, but the onboarding is broken. Fix the UX.
- Low Awareness, High Utility: The "Hidden Gem." A massive marketing failure. Redeploy with better in-app messaging.
- High Awareness, Low Utility: The "Dud." Marketing did its job, people tried it, and they hated it. Sunset the feature.
- Low Awareness, Low Utility: Total failure. Delete the code.

# Section 3: Quality Weighting Rules
**The 'Habit Disruption' Anchor:** Feedback regarding the difficulty of breaking an old habit is weighted at 2x. If the new feature requires the user to fundamentally change how their team operates, the "Utility" of the new feature must be exponentially higher than the old way, or adoption will never organically occur.

# Section 4: Benchmark Context
**The 'Aha!' Timeline:** The Analytics agent must calculate the "Time to Value" (TTV). If a feature requires a user to input 45 minutes of data before they see the *first* dashboard/result (the Aha! moment), the Analytics agent must flag this as an unviable TTV for modern digital consumers.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Feature analyzed, baseline adoption metrics, user cohort.
**Section 2: Executive Summary**
The definitive diagnosis of the primary adoption roadblock (Awareness, Setup, or Utility).
**Section 3: The Setup Tax Analysis**
A step-by-step breakdown of exactly where the onboarding friction outweighed the perceived value.
**Section 4: The 'Aha!' Moment Diagnosis**
Calculation of the "Time to Value" and recommendations for shortening it.
**Section 5: Decision Map Response**
Direct mapping to the specific onboarding redesigns, tooltip rewrites, or sunsetting decisions requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze the "Terminology Gap." If the product team named a feature "Dynamic Sync," but the Analytics agent detects that 70% of respondents refer to it naturally as "Auto-Save," the agent must explicitly recommend renaming the feature in the UI to match the user's mental model, as nomenclature is a massive barrier to adoption.

# Section 7: Flagging and Limitation Language
**When a 'Dud' (High Awareness, Low Utility) is detected:**
"Synthesis of the adoption metrics reveals a terminal failure in the feature's core utility proposition. This is not a discoverability issue; [Percentage]% of the cohort successfully located the feature and initiated the workflow. However, after successful trial, behavioral retention dropped to zero. Respondents consistently cited that the feature solved a 'non-issue' or added unnecessary steps to an already functioning workflow. We strongly advise against investing further engineering resources into optimizing the onboarding for this feature; the feature itself lacks product-market fit and should be considered for deprecation."
