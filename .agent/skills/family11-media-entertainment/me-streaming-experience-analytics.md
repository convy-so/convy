---
name: Streaming Experience Research (Analytics)
description: Analytics agent skill for interpreting Streaming Experience Research. Focuses on quantifying 'Scroll Fatigue', diagnosing subscription churn triggers, and evaluating UX/UI friction.
id: me-streaming-experience-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Streaming Experience data is the operational dashboard of a digital utility. A great movie cannot save a terrible app. The Analytics agent must synthesize the transcripts to identify exactly where the "Friction" lives. Is the friction financial (it costs too much)? Is it cognitive (there's too much choice)? Is it mechanical (the app crashes on smart TVs)? The agent must separate complaints about *Content* (which the product team can't fix) from complaints about *Design* (which the product team must fix).

# Section 2: Coverage Interpretation Guide
**The Platform Matrix:**
- High Value, Low Friction: The Essential Utility. The user will never cancel.
- High Value, High Friction: The Frustrating Monopoly. They hate the app, but love the content. Vulnerable to any competitor with a better app.
- Low Value, Low Friction: The Zombie Sub. They don't watch it much, but the app is smooth and they forgot they pay for it.
- Low Value, High Friction: The Danger Zone. High, active churn. They will cancel the second they finish the one show they wanted.

# Section 3: Quality Weighting Rules
**The 'Bail Rate' Multiplier:** Feedback explicitly describing a user abandoning the platform *after* opening it (e.g., "I log in, look around for five minutes, get annoyed, and switch to Hulu") is weighted at 4x. This metric ('False Starts') is the most accurate predictor of future subscription cancellation.

# Section 4: Benchmark Context
**The "Hero vs Library" Reality:** The Analytics agent must determine if the platform is functioning as a "Library" (users continually discovering new things) or a "Tollbooth" (users paying $15 just to access one specific show). If it is a Tollbooth, the Analytics report must warn the client that churn will spike the exact moment the "Hero" show's season finale airs.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Platform evaluated, demographic bounds.
**Section 2: Executive Summary**
The definitive diagnosis of the Platform Matrix (e.g., "A Frustrating Monopoly Highly Vulnerable to Churn").
**Section 3: The 'Scroll Fatigue' Audit**
Specific measurement of how choice paralysis is driving users to competitive ambient media (e.g., YouTube/TikTok).
**Section 4: UX/UI Friction Log**
Granular list of mechanical failures (e.g., autoplay trailers, bad search functionality, mixing paid/free content).
**Section 5: Decision Map Response**
Direct mapping to the UI redesigns, subscription tier changes, or curation strategies requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze the "Ad-Tolerance Threshold." If respondents universally state they downgraded to the ad-supported tier to save money, but the ad load is so aggressive that they now actively avoid opening the app, the Analytics agent must flag that the current monetization structure is cannibalizing long-term retention.

# Section 7: Flagging and Limitation Language
**When a severe 'Paradox of Choice' failure is detected:**
"Synthesis of the UX data reveals a terminal 'Paradox of Choice' failure dominating the user experience. Across [Percentage]% of evaluated users, the act of opening the application triggers cognitive overwhelm rather than entertainment anticipation. Users reported an average 'Scroll Duration' of over 15 minutes that frequently resulted in application abandonment (the 'Bail Rate'). The current homepage architecture—which prioritizes algorithmic volume over curated simplicity—is actively driving users to lower-friction competitors like YouTube. We strongly advise an immediate UI test that drastically reduces the number of horizontal carousels on the homepage, anchoring the user with a single, highly confident recommendation."
