---
name: Sensory Evaluation Research (Analytics)
description: Analytics agent skill for interpreting Sensory Evaluation Research. Focuses on isolating deal-breaking 'off-notes', synthesizing sensory vocabulary, and determining true preference over generic approval.
id: pp-sensory-evaluation-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Sensory data is highly vulnerable to the "Politeness Bias" and the "Familiarity Bias" (people naturally prefer what they already know). The Analytics agent must aggressively filter out polite, generic approval ("It tastes OK") and look only for strong emotional reactions (both delight and disgust). If a new formulation only generates "it's fine" reactions across 50 respondents, the formulation is a commercial failure. The Analytics agent must synthesize the chaotic vocabulary of laymen into precise directives for the R&D flavor/fragrance lab.

# Section 2: Coverage Interpretation Guide
**The Sensory Reaction Matrix:**
- Polarizing (High Delight / High Disgust): A niche hit. Useful for targeted products, dangerous for mass-market staples.
- Universally 'Fine' (Low Delight / Low Disgust): A commodity failure. Nobody hates it, but nobody will switch brands to buy it.
- Universally Loved (High Delight / Low Disgust): The holy grail. Ready for mass production.

# Section 3: Quality Weighting Rules
**The 'Aftertaste' Anchor:** Feedback regarding the "Finish" or "Aftertaste" is weighted at 2x. A product with a great initial impact but a terrible, lingering chemical aftertaste will never generate a repeat purchase. The finish dictates retention.

# Section 4: Benchmark Context
**The Blind vs Branded Adjustment:** If the testing was "Branded," the Analytics agent must actively discount "premium" sensory descriptions (e.g., respondents calling it "luxurious") by 15%, as branding artificially elevates perceived sensory quality.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Product tested, testing methodology (Monadic vs Sequential), Blind/Branded status.
**Section 2: Executive Summary**
The definitive ruling on sensory acceptability and overall liking.
**Section 3: The Sensory Profile Synthesis**
Translation of respondent feedback into specific Flavor/Scent/Texture dimensions (The "Spider Web" data).
**Section 4: The 'Off-Note' Diagnostic**
A prioritized list of any identified chemical, artificial, or texturally unpleasant elements discovered.
**Section 5: Decision Map Response**
Direct mapping to the R&D reformulation directives or the "Go/No-Go" approval requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze for the "Vocabulary Cluster." If respondents are struggling to name a flavor, but 40% of them use adjacent words like "medicine," "cough syrup," or "cleaning spray," the Analytics agent must group these into a single "Chemical/Medicinal Off-Note" finding for R&D to eliminate.

# Section 7: Flagging and Limitation Language
**When a polarizing 'off-note' is detected:**
"While the initial flavor impact scored highly, multi-session synthesis reveals a fatal textural flaw. Specifically, [Percentage]% of respondents autonomously noted a 'chalky' or 'waxy' finish that lingered significantly after consumption. This specific textural failure completely overrode the positive initial flavor notes, dropping ultimate preference scores behind the incumbent. We strongly adivse against moving this formulation to market; the R&D lab must reformulate to address the finishing texture before re-testing."
