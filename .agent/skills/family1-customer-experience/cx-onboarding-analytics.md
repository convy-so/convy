---
name: onboarding-analytics
description: Use to interpret onboarding experience data. Audits "Activation Velocity" and "Time-to-Value".
id: cx-onboarding-analytics
version: 1.1.0
---

## Interpretation Framework
**Goal:** Determine if activation (Aha!) was reached, when, and what specific trigger produced it.
**Principle:** Activation vs. Satisfaction. Smooth setup does not equal value discovery.
**Technical vs. Conceptual:** Technical barriers (UX) require design fixes; Conceptual (Why) require education/content.
**Quality Rule:** Identification of a specific "Click" moment and its trigger is the #1 data value.

## Critical Misreadings
- **The Procedural Trap:** Customer completed setup but never derived functional value.
- **Support-Dependent Adoption:** Activation achieved but only through high-cost human intervention.
- **The Honeymoon Blur:** Uniformly positive pulse masking friction points.
- **Capability Shame Attribution:** Customer blaming themselves for poor product communication.

## Evidence Hierarchy
| Tier | Title | Evidence Type |
|---|---|---|
| Tier 1 | Behavioral (1.00) | Specific "Click" moment named + Value/Trigger identified. |
| Tier 2 | Narrative (0.70) | General sense of "getting it" but fuzzy timing/trigger. |
| Tier 3 | Pulse (0.4) | "Everything is fine" without specific use-case capability. |
| Tier 4 | Zero | No activation moment reached. Primary finding. |

## Synthesis & Reporting Patterns
| Pattern | Signal | Action |
|---|---|---|
| Early Activator | < 1 session (Mobile) / < 7 days (SaaS) | Reference Case: Isolate the "Golden Path" feature. |
| Delayed Activator | Activation > 14 days / Multi-friction | Journey Audit: Identify the delay-producing friction. |
| Non-Activator | 100% Setup completion / 0 value discovery | Critical Risk: Value mismatch or conceptual wall. |
| Support Dependency| Active but required > 2 human contacts | Scalability Risk: Improve self-service education. |

## Scoring Weighting
- **Velocity Multiplier (x1.3 on Early):** Weight findings higher if activation occurs in session 1.
- **Complexity Penalty (-0.15):** Subtract from confidence if technical barriers >2 without conceptual mastery.

## Reporting Artifacts
**Part 1: Executive Summary** (Activation status, Velocity, and "Click" trigger).
**Part 2: Activation Analysis** (The "Aha!" moment cause. If not reached, the primary barrier).
**Part 3: Setup Friction** (Narrative of configuration. characterization as Tech/Con).
**Part 4: Support Dependency** (Human vs. Self-service fail points).
**Part 5: Decision Map Response** (UX design vs. Content education fixes).

## Escalation Protocols
- **Immediate Churn Alert:** No activation reached + High Technical Friction + Negative Sentiment.
- **Support Capacity Threat:** High-value customer showing 100% human-support dependency for basic setup.
- **Value Mismatch Risk:** Expected value (Purchase) diverges from actual value (Activation).

## Reporting Flag Templates
**RECENCY WARNING:**
> "This session was conducted >12 weeks after onboarding. Friction recall may be impressionistic rather than granular. Activation timing remains reliable."

**HONEYMOON EFFECT:**
> "Respondent exhibits high early-adoption enthusiasm. Friction items may be suppressed. Focus on Improvement Data for actionable gaps."

**NON-ACTIVATION:**
> "PRIMARY FINDING: Activation was NOT reached. The product has not yet provided functional value to this customer. Adoption is at risk."