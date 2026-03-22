---
name: post-transaction-analytics
description: Use to interpret post-transaction experience data. Audits the "Journey Arc" (Expectation vs. Reality).
id: cx-post-transaction-analytics
version: 1.1.0
---

## Interpretation Framework
**Goal:** Determine if failure is a "Delivery Failure" (Ops) or a "Promise Failure" (Marketing).
**Principle:** Stage-Level Priority. Over-all satisfaction hides truth; prioritize Commitment, Wait, Delivery, and First Use.
**Delivery vs. Promise:**
- Product matches website but user is unhappy = Marketing Failure.
- Product differs from website = Operations Failure.
**Normalization Signal:** "It's always slow" indicates systemic finding, not a one-off event.

## Critical Misreadings
- **Summary Collapse:** Do not use overall scores to mask stage-level friction.
- **Accuracy vs. Quality:** Separately report "Wrong Item" (Ops/Severity High) vs. "Poor Quality" (Design/Mfg).
- **The Transactional Void:** "It was fine" - non-specific experiences with zero brand loyalty impact.
- **Commitment Bias:** High-value purchasers defending their choice by minimizing disappointment.

## Evidence Hierarchy
| Tier | Title | Evidence Type |
|---|---|---|
| Tier 1 | Full Gap (1.00) | Expectation Source + Specific stage-friction + Gap characterization. |
| Tier 2 | Friction (0.70) | Specific friction described but no clear expectation source established. |
| Tier 3 | Generic (0.4) | Non-anchored satisfaction/dissatisfaction. |
| Tier 4 | Zero Baseline | No expectation baseline established. Session cannot support gap analysis. |

## Synthesis & Reporting Patterns
| Pattern | Signal | Action |
|---|---|---|
| Honest Failure | Correct Promise / Ops Execution Failure | Operations Fix: Review logistics/SLA. |
| Overpromised Success | Ops Execution OK / Marketing/Comms over-stated | Marketing Fix: Update copy/photography. |
| Radio Silence | Wait period >3 days with zero updates | CRM Fix: Implement status trigger emails. |
| The Frictionless Regrettor | Smooth journey but product-expectation mismatch | Design/Promise Fix: Re-align price-to-quality. |

## Scoring Weighting
- **Stakes Multiplier (x2.0 on SE-04):** Double gap severity for High-Stakes (Meeting/Funeral) transactions.
- **"Arrival Relief" Discount (-0.15):** Subtract 0.15 if Tier 1/2 friction was present but forgiven at point of receipt.

## Reporting Artifacts
**Part 1: Executive Summary** (Stage of Greatest Friction).
**Part 2: Pre-Purchase Baseline** (Expectation source/substance).
**Section 3: Journey Stage Analysis** (Checkout, Fulfillment Comms, Delivery).
**Section 4: The First Use Gap** (Product experience vs. Promise).
**Section 5: Decision Map Response** (Promise vs. Delivery fixes).

## Escalation Protocols
- **Fundamental Fulfillment Failure:** Wrong item + High resolution effort.
- **Radio Silence Alarm:** Fulfillment wait >3 days with no status updates.
- **Promised Value Breach:** Explicit Marketing promise vs. Proven receipt of Y.

## Reporting Flag Templates
**BASELINE MISSING:**
> "Primary Limitation: This session failed to establish a pre-purchase expectation baseline. Gap analysis is impressionistic and lacks a reliable comparison point."

**COMMITMENT BIAS:**
> "Respondent exhibits commitment bias following a high-value purchase. Findings likely under-report friction. Focus on Section 5 Improvement suggestions for actionable data."

**NORMALIZATION:**
> "Respondent has normalized recurring failures ('it's always slow'). This indicates a systemic brand failure rather than a single-transaction event."