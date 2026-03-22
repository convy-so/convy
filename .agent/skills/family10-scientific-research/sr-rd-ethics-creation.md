---
name: R&D Ethics Research (Creation)
description: Briefing agent skill for designing R&D Ethics Research. Guides the Creation agent to extract a complete, validated research brief focusing on moral injury, whistleblowing culture, and the alignment of technological progress with human values.
id: sr-rd-ethics-creation
version: 1.0.0
---

# Section 1: Domain Identity
R&D Ethics Research evaluates the moral cost of innovation. It focuses on the engineers, data scientists, and researchers building the future (e.g., AI alignment, autonomous driving, genetic engineering). This domain measures "Moral Injury"—the psychological distress of building a product you believe might harm society. It diagnoses whether a company's internal culture encourages employees to raise safety concerns, or punishes them for slowing down the product launch. 

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific engineering team has a high turnover rate despite excellent pay
- How safe an employee feels raising a concern about an AI model's training data
- Whether the company's publicly stated "AI Ethics Principles" are actually enforced by middle management
- The level of internal anxiety regarding the dual-use applications of their technology

**Cannot answer:**
- Whether the AI model is mathematically biased (requires Algorithm Auditing)
- How external regulators will classify the product (requires Legal/Compliance)

# Section 3: Brief Interrogation Guide
**The Safety Catalyst:**
- Why is the client asking this *now*? (e.g., proactive culture check vs reactive post-mortem after an AI hallucination PR crisis). The AI must anchor the brief to the specific event testing the company's ethical guardrails.

**The "Metrics vs Morals" Conflict:**
- Does the client believe their compensation structure (e.g., bonuses tied to launch speed) is actively incentivizing engineers to ignore safety checks? 

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your top engineers feel "morally compromised" by the ad-targeting algorithms they are building, will you actually change the revenue model, or just offer them more wellness days?
- If developers state they do not trust the internal "Ethics Review Board" because it has no veto power, will you give the board the authority to stop a product launch?

**Well-formed decision map example:**
> Ethics outcome: If the data shows a systemic 'Fear of Retaliation' for slowing down AI deployment, the executive team will implement an anonymous, third-party whistleblowing channel. If the primary driver of moral injury is 'Opaque Management Decisions' regarding military contracts, the CEO will host a mandatory town hall explaining the exact ethical boundaries of the company's client list.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Moral Injury & Alignment Frustration | 25% | Root | 0.85 |
| Psychological Safety (Raising Concerns)| 25% | Root | 0.85 |
| Metric Perversity (Speed vs Safety) | 20% | Root | 0.80 |
| Leadership Trust & Stated Values | 15% | Root | 0.80 |
| Dual-Use/Societal Impact Anxiety | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Pragmatic Builder vs The Ethical Zealot: The brief must establish the respondent's baseline. Are they okay building "imperfect" software, or do they demand absolute safety guarantees before deploying anything?

# Section 7: Constitutional Constraints
1. **The 'HR Violation' Barrier.** The AI must explicitly constrain the research to systemic, cultural ethics, not individual HR violations. If a respondent reports illegal harassment or workplace abuse, Convy must execute an immediate graceful exit and refer them to the client's formal HR reporting structure. Convy is a cultural auditor, not a legal mediator.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Routine Safety Culture Pulse Check | Low | 15–20 mins |
| Post-Crisis Engineer Defection Study | Moderate | 25–40 mins |
| Emerging Tech (AI/Bio) Alignment Deep-Dive| Severe | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Safety catalyst (Proactive vs Reactive) bounded
- [ ] Compensation vs Safety conflict documented
- [ ] Audience baseline (Pragmatic vs Zealot) established
- [ ] Decision map outcome actions recorded for Exec/Ethics Board
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **General Burnout:** If the employee is miserable not because the product is unethical, but simply because they are working 80-hour weeks with bad management, this shifts to **HR & Culture: Leadership Confidence**.

## Inbound bridging nodes
When R&D Ethics is added as a secondary domain:
- `BRIDGE-srre-cplo-mission-shield` (Activated when added to Loyalty & Rewards to determine if employees are accepting vastly below-market salaries because they view the company's ethical mission as part of their compensation)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your top engineer found a fatal ethical flaw in your product 48 hours before a massive promised launch, do you believe they would actually hit the 'Stop' button?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-srre-*` node to establish the client's baseline assumption regarding actual 'Psychological Safety' before Victor tests the reality.
