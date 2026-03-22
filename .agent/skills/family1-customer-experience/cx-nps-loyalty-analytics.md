---
name: nps-loyalty-analytics
description: Use to interpret NPS and brand loyalty data. Audits "Vesting vs. Value" and churn risk.
id: cx-nps-loyalty-analytics
version: 1.1.0
---

## Interpretation Framework
**Goal:** Distinguish between Situational Friction (temporary) and Structural Misalignment (churn).
**Principle:** Vesting vs. Value Ratio. Customers may stay because they are "Vested" (high switching cost) or "Value" (ROI) driven.
**Situational vs. Structural:**
- Site down yesterday = Situational.
- Pricing model doesn't scale = Structural.
**Quality Rule:** If Score and Text mismatch, Text holds 100% analytical weight.

## Critical Misreadings
- **The Polite Eight:** 7-8 scores often hide latent churn; look for unvoiced irritation.
- **Venting Bias:** A single negative event (outage) clouding long-term structural value.
- **Vesting Trap:** High retention despite low NPS (Monopoly or High migration cost).
- **Honeymoon Effect:** inflated 10/10 scores from new customers (tenure < 30 days).

## Evidence Hierarchy
| Tier | Title | Evidence Type |
|---|---|---|
| Tier 1 | Behavioral (1.00) | Specific behavioral intent: "Started trial with [Competitor]." |
| Tier 2 | Comparative (0.90)| Explicit tradeoff: "Your support is 10x faster than [X]." |
| Tier 3 | Absence (0.85) | Impact of service loss: "Team productivity would drop 20%." |
| Tier 4 | Affective (0.60) | General pulse: "I like the brand, they do good things." |
| Tier 5 | Deflection (0.45) | "Everything is fine." (Likely hidden Passive risk). |

## Synthesis & Reporting Patterns
| Pattern | Signal | Action |
|---|---|---|
| The Silent Burner | 8/10 Score / Started competitor trial | High Churn Risk. Immediate "Save" play required. |
| The Loyal Victim | 2/10 Score / High Vesting (No alternatives) | PR Liability. Monopoly frustration; risk if market opens. |
| The Grudging Pro | Low UX Score / High Utility dependence | Tactical Roadmap Fix: UX/UI debt repayment. |
| The Ghost User | Paying / Zero usage / Neutral Score | Churn Warning. Forgotten subscription friction. |

## Scoring Weighting
- **Stakes Multiplier (x1.5 on Structural):** Weight structural findings higher if account MRR > Threshold.
- **Vesting Discount (-0.20):** Subtract from Advocacy score if Switching Inertia is confirmed as the primary stay-driver.

## Reporting Artifacts
**Part 1: Executive Summary** (Promoter/Passive/Detractor volume & Structural Risks).
**Part 2: The Driver Cluster** (Product, Service, Price, or UX).
**Part 3: Structural vs. Situational Assessment** (Inherent model vs. Execution failure).
**Part 4: Switching Risk** (Active consideration & Competitor Mentions).
**Part 5: Decision Map Response** (Promise fixes vs. SLA/Ops fixes).

## Escalation Protocols
- **Definite Churn Intent:** High-confidence mention of active switching/non-renewal.
- **Severe Product Failure:** Data loss, security breach, or total downtime.
- **Legal/PR Risk:** Threats of litigation or viral negative publicity.

## Reporting Flag Templates
**VENTING DOMINATION:**
> "This session was heavily influenced by a recent negative situational event. While the Detractor score is valid, the data regarding long-term structural value may be obscured by immediate frustration."

**PASSIVE DEFLECTION:**
> "The respondent provided a Passive score but demonstrated significant reluctance to provide critical feedback. Stated friction points likely underrepresent true switching risk."

**GHOST USER:**
> "Respondent is a 'Ghost User' (zero usage recorded). Satisfaction/Loyalty data is based on branding/billing perception rather than functional utility."
