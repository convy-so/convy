---
name: Citizen Service Research (Analytics)
description: Analytics agent skill for interpreting Citizen Service Research. Focuses on quantifying 'Administrative Burden', isolating operational bottlenecks, and stripping partisan bias from service feedback.
id: cp-citizen-service-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Citizen Service data is the operational report card for a government agency. Unlike private businesses, government agencies don't look at "Revenue" or "Churn" to determine if they are successful (because citizens are a captive monopoly). Instead, they must look at "Administrative Burden"—the amount of time, money, and dignity a citizen must sacrifice to obtain a public service. The Analytics agent must synthesize the transcripts to identify where the bureaucracy is actively harming the public. If an application form is so complex that 40% of eligible citizens give up halfway through, the Analytics agent must flag this as a systemic failure of public policy execution.

# Section 2: Coverage Interpretation Guide
**The Service Matrix:**
- High Efficiency, High Empathy: The Civic Ideal. The process was fast and the staff was kind.
- High Efficiency, Low Empathy: The DMV Model. The citizen got what they needed out of the machine, but felt like a number. Acceptable for low-stakes services.
- Low Efficiency, High Empathy: The Friendly Disaster. The staff is trying their best, but the technology or legal red-tape is fundamentally broken.
- Low Efficiency, Low Empathy: Institutional Failure. The process is impossible and the staff is hostile. Requires immediate executive intervention.

# Section 3: Quality Weighting Rules
**The 'Vulnerable Population' Multiplier:** Feedback regarding extreme complexity or accessibility failures from non-native speakers, the elderly, or low-income cohorts is weighted at 4x. These cohorts are the primary targets of social safety nets; if the portal is too hard for them to use, the policy has failed.

# Section 4: Benchmark Context
**The Partisan Deflation Rule:** The Analytics agent must actively filter out generalized "anti-government" or "anti-tax" rhetoric when calculating the actual Service Quality score. A citizen who hates the current Mayor might rate the garbage collection as a "1 out of 10" out of spite, even if the garbage is collected perfectly on time. The Analytics agent must rely strictly on mechanical behavioral tracing (e.g., "Was the bin picked up? Yes.") to override the biased rating.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Specific civic service evaluated, demographic cohorts targeted.
**Section 2: Executive Summary**
The definitive diagnosis of the Administrative Burden (e.g., "Friendly Disaster").
**Section 3: The Friction & Bottleneck Report**
A sequential breakdown of exactly where the process stalls (forms, wait times, staff handoffs).
**Section 4: The Accessibility & Comprehension Audit**
Analysis of whether the materials are actually readable by the general public.
**Section 5: Decision Map Response**
Direct mapping to the UX redesigns, staffing reallocations, or process simplifications requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze for the "Digital Exclusion Effect." If the agency recently digitized a service to make it "easier," but the Analytics agent detects a massive spike in failure rates among seniors who no longer have an in-person option, the agent must flag that the 'efficiency upgrade' has created a discriminatory barrier.

# Section 7: Flagging and Limitation Language
**When severe 'Administrative Burden' is detected:**
"Synthesis of the application process reveals a severe 'Administrative Burden' that is actively undermining the intent of the public program. Across [Percentage]% of evaluated interactions, eligible citizens successfully began the process but abandoned it at [Specific Step], citing impenetrable legal jargon and redundant documentation requirements. This is not a lack of interest from the public; it is a mechanical failure of the forms. We strongly advise pausing any further outreach marketing until the core application is rewritten to a 6th-grade reading level and digitized to prevent data-loss mid-session."
