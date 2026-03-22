---
name: proposition-testing-analytics
description: Use to interpret proposition research. Audits "Comprehension Accuracy" and "False Positives."
id: mi-proposition-testing-analytics
version: 1.1.0
---

## Interpretation Framework
**Goal:** Audit product-market fit *before* build. Identify the precise Point of Failure (Messaging vs. Credibility vs. Relevance).
**Key Metric:** **Comprehension Accuracy.** 80% baseline required. If they don't get it, the demand data is invalid.
**Principle:** **Politeness Discounting.** Radical reduction of "neat idea" or "cool concept" mentions without behavioral anchors.
**Quality Rule:** **Execution Filter.** Strip usability complaints from low-fidelity tests. Isolate the *conceptual* feedback.

## Critical Misreadings
- **The Politeness Trap:** Taking "It's a good idea" as validation rather than a polite lie.
- **Comprehension Blindness:** Misinterpreting rejection due to "bad copy" as "bad product."
- **Shiny Object Syndrome:** Overweighting enthusiasm for novel tech that solves no real pain.
- **Vacuum Evaluation:** Ignoring the respondent's current workaround (The Status Quo benchmark).

## Failure Matrix
| Scenario | signal | Interpretation |
|---|---|---|
| Low Comprehension | Misinterpretation of copy | **BRIDGE FAILURE.** Unsalvageable until copy is rewritten. |
| High Comp / Low Rel | "I get it, I don't need it" | **STRATEGY FAILURE.** No market for this problem. |
| High Comp / Low Cred | "Too good to be true" | **CREDIBILITY FAILURE.** Claim is too bold/suspicious. |
| High Comp / High Rel | "I need this tomorrow" | **VALIDATED.** Blueprint for Go/No-Go decision. |

## Synthesis & Reporting Patterns
| Pattern | Signal | Action |
|---|---|---|
| The "Aha!" Moment | Specific phrase/visual clicks | Marketing Pivot: Make this specific item the headline. |
| The "Catch" | Consistently cited doubt | R&D/Product: Address the structural objection in design. |
| Adoption Fear | High friction vs. Old way | UX Focus: Simplify onboarding; minimize switching cost. |
| Substitution | "I'll stick with Excel" | Positioning Pivot: Must be 9x better than the workaround. |

## Synthesis Protocols
- **Step 1 (The Comprehension Audit):** Map the Mental Model vs. The Pitch reality.
- **Step 2 (The Relevance Filter):** Isolate "Must-Have" (Painkiller) vs. "Nice-to-Have" (Vitamin).
- **Step 3 (The Trust Audit):** Detect BS/Credibility gaps in the core promise.
- **Step 4 (The Wallet Simulation):** Evaluate demand based on simulated commitment (The Wallet Test).

## Reporting Artifacts
**Part 1: Study Parameters** (Stimulus tested, Audience segments, Current alternatives).
**Part 2: Executive Summary** (Definitive Go/No-Go/Pivot recommendation).
**Part 3: Comprehension & Clarity** (Analysis of the mental model vs. intended message).
**Part 4: The Demand Equation** (Synthesis of Relevance, Believability, and Friction).
**Part 5: Decision Map Response** (Direct mapping to roadmap or messaging rewrite).

## Flagging Templates
**COMPREHENSION FAILURE:**
> "Fundamental comprehension fell below 80%. Respondents misinterpreted core mechanic as [Incorrect Mechanic]. Subsequent intent data is false signal. Rewrite copy and re-test."

**POLITENESS ALERT:**
> "High frequency of 'Cool Idea' praise with zero behavioral anchors or problem-relevance. Significant risk of false-positive validation. Final demand weighted at 0.30."

**ADOPTION BARRIER:**
> "Relevance is high, but Adoption Friction (Switching Cost) is perceived as insurmountable. Product will fail at launch without a migration automator."
