---
name: dining-restaurant-analytics
description: Use to interpret dining and restaurant experience data. Audits the "Orchestrated Occasion" (Kitchen vs. Floor).
id: se-dining-restaurant-analytics
version: 1.1.0
---

## Interpretation Framework
**Goal:** Capture convergence of sensory product (Kitchen) and hospitality rhythm (Floor).
**Principle:** Occasion Anchor dictates tolerance. Loud is a success for "Celebration," shift failure for "Business."
**Vector A (Kitchen):** The Product. Taste, temp, presentation. Driver of Return Intent.
**Vector B (Floor):** The Operation. Pacing, rhythm, hospitality. Driver of Value Perception.
**Vector C (Environment):** The Container. Lighting, noise, energy.
**Halo Effect:** When excellent food (A) masks slow pacing or check wait (B). Action: Decompose operational vectors.

## Critical Misreadings
- **Flavor Sentiment only:** "Food was good" is 25%; the Clock (SE-03) is 50%. Rushed/Slow diners are retention risks.
- **Energy vs. Noise:** If "Business" diners report "Lively," find "Acoustic Friction."
- **The Hostage Phase:** Waiting for the check is the most common "Silent Friction." Weight higher as final memory.

## Evidence Hierarchy
| Tier | Title | Evidence Type |
|---|---|---|
| Tier 1 | Sequence Walk (1.00) | Specific: "Ordered at 8:10, drinks arrived at 8:30 (after starters)." |
| Tier 2 | Sensory Fidelity (0.90) | Specific: "Leaning across table to hear partner over music." |
| Tier 3 | Occasion Mismatch (0.80) | Benchmark: "Wanted quiet talk, but tables were 6 inches apart." |
| Tier 4 | General Food (0.50) | Subjective: "The pasta was delicious" (Directional only). |
| Tier 5 | Generic Social (0.25) | Atmospheric: "Staff were friendly" (Weighted 0.65; contextual). |

## Synthesis & Reporting Patterns
| Pattern | Signal | Action |
|---|---|---|
| Great Kitchen / Broken Floor | High SE-05 / Low SE-03 | Fragile state; operational delays hidden by chef skill. |
| Unfelt Luxury | High Price / Low SE-04 | Hospitality failure; reactive vs. intuitive staff. |
| Transactional Success | High Pacing / Zero Warmth | Operational efficiency without hospitality care. |
| Occasion Mismatch | Dissatisfaction due to high stakes vs. venue style | Marketing/Reservation failure vs. operational error. |

## Scoring Weighting
- **Occasion Multiplier (+0.20):** Increase failure severity for "High Stakes" (Anniversary/Business) guests.
- **Hostage Penalty (-0.15):** Cap Value (SE-06) at 0.70 if check wait >10 mins, regardless of food quality.

## Reporting Artifacts
**Part 1: Executive Summary** (The Occasion Calibration).
**Part 2: Structural Findings** (The Pacing Pulse & Sensory Friction).
**Part 3: Kitchen vs. Floor Performance** (Specific operational deltas).
**Part 4: Recommendations** (Menu / Training / Acoustic interventions).

## Escalation Protocols
- **High-Friction "Hostage" State:** Systemic inability to pay/get check.
- **Structural Sensory Failure:** Noise levels preventing core "Occasion" conversation.

## Reporting Flag Templates
**HALO EFFECT:**
> "The respondent demonstrated a strong 'Food Quality' Halo (SE-05). Despite reporting significant pacing delays (SE-03), their overall sentiment remained high. This is a fragile satisfaction state."

**OCCASION MISMATCH:**
> "The dissatisfaction noted in 'Ambiance' (SE-02) is driven by an 'Occasion Mismatch.' The respondent's expectations for a [occasion] were at odds with the venue's brand energy."
