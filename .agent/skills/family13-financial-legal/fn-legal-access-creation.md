---
name: Legal Access Research (Creation)
description: Briefing agent skill for designing Legal Access Research. Guides the Creation agent to extract a complete, validated research brief focusing on intimidation, cost-barriers, and the usability of legal services.
id: fn-legal-access-creation
version: 1.0.0
---

# Section 1: Domain Identity
Legal Access Research evaluates the intersection of "The Law" and "The Consumer." Historically, the legal system was gated by massive financial barriers and intentional complexity. With the rise of LegalTech (e.g., LegalZoom, RocketLawyer) and accessible counsel, consumers now interact with the law digitally. This domain measures the friction of obtaining a will, incorporating a business, or fighting a ticket. It diagnoses whether a legal product makes the user feel "protected" or "vulnerable."

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why small business owners abandon the digital LLC-formation process halfway through
- The perceived trustworthiness of an AI-generated legal contract versus a human lawyer
- Whether the marketing language for a specific legal service feels "intimidating" or "accessible"
- The primary cost-barrier preventing a demographic from drafting an estate plan

**Cannot answer:**
- What specific legal precedent applies to the user's case (requires actual Legal Counsel)
- Why the user's business loan was rejected (requires Banking Trust)

# Section 3: Brief Interrogation Guide
**The Access Catalyst:**
- Why is the user seeking legal help *now*? (e.g., proactive business formation vs reactive lawsuit defense). The AI must branch the brief here; proactive users want speed, reactive users want reassurance.

**The "Robot vs Lawyer" Hypothesis:**
- Does the client believe their users actually *want* a human lawyer, or do they just want the legal document as cheaply and quickly as possible?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that users fundamentally do not trust your "AI Contract Review Tool" because they are terrified of getting sued, will you add a "Human Review Guarantee" to the pricing tier?
- If users explicitly state that the legal jargon on your pricing page makes them feel stupid, will you rewrite it in plain English?

**Well-formed decision map example:**
> Legal Access outcome: If the data shows that the primary driver for cart abandonment in the Estate Planning funnel is 'Fear of Choosing the Wrong Option,' the product team will implement a gated, 3-question survey that auto-selects the correct tier for the user. If users abandon because the forms take too long to fill out, the engineering team will prioritize API integration to auto-fill government data.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Complexity & Intimidation (Jargon) | 25% | Root | 0.85 |
| Cost Transparency vs Perceived Value | 20% | Root | 0.80 |
| Trust in Tech vs Trust in Humans | 20% | Root | 0.85 |
| Procedural Friction (Paperwork) | 20% | Root | 0.80 |
| Emotional Reassurance & Protection | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Pro-Se DIYer vs The Hand-Holder: The brief must establish the user's confidence level. Do they want the software to do everything for them invisibly, or do they want to read and approve every single clause?

# Section 7: Constitutional Constraints
1. **The 'Unauthorized Practice of Law' Ban.** The AI must never validate a brief that asks to generate customized legal advice or measure the legal accuracy of a document. The AI must explicitly constrain the research to the *user experience* and *perception* of the legal product/service.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Pricing/Tier Page Clarity Audit | Low | 15–20 mins |
| First-Time Founder Onboarding Journey | Moderate | 25–40 mins |
| Trust in Automated Legal AI Tools | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Catalyst type (Proactive vs Reactive) bounded
- [ ] Core hypothesis (Tech vs Human preference) documented
- [ ] Audience baseline (DIY vs Hand-Holder) established
- [ ] Decision map outcome actions recorded for Product/Marketing
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Data Privacy Panic:** If the user abandons the legal form because they are terrified of uploading their Social Security Number to a cloud server, this instantly triggers **Digital Product: Cybersecurity & Trust**.

## Inbound bridging nodes
When Legal Access is added as a secondary domain:
- `BRIDGE-fnla-hrcl-liability-fear` (Activated when added to HR & Culture to determine if managers are refusing to give honest performance reviews because they are terrified of being sued)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your average customer had to explain what your legal product actually does to a 10-year-old, how would they describe it?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-fnla-*` node to establish the ultimate 'Plain English' baseline for the Conducting agent to measure against.
