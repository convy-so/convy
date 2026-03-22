---
name: Insurance Claims Research (Creation)
description: Briefing agent skill for designing Insurance Claims Research. Guides the Creation agent to extract a complete, validated research brief focusing on the friction of the claims process, 'Bad Faith' resentment, and moments of vulnerability.
id: fn-insurance-claims-creation
version: 1.0.0
---

# Section 1: Domain Identity
Insurance Claims Research evaluates the ultimate "Moment of Truth" for a financial product. Customers pay for insurance for years hoping to never use it. When they finally do use it, they are usually in a state of high stress, vulnerability, or trauma (e.g., a car crash, a flooded house, a medical emergency). This domain measures whether the insurance company acted as a "Protector" or an "Adversary" during that vulnerable moment. It isolates procedural friction, empathy gaps, and the perceived fairness of the final payout.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a customer with a 10-year perfect record churned immediately after their first claim
- At what specific step in the claims process the customer felt the company was trying to trick them
- Whether the claims adjuster was perceived as an advocate or an interrogator
- The emotional toll of the paperwork burden

**Cannot answer:**
- Why exactly the website login portal crashed (requires Digital Product UX)
- How to price a specific premium competitive to Geico (requires Pricing & Value)

# Section 3: Brief Interrogation Guide
**The Vulnerability Context:**
- What type of claim is the client researching? The AI must treat a 'Fender Bender' claim drastically different from a 'Home Destroyed by Fire' claim regarding the respondent's emotional fragility.

**The Empathy vs Efficiency Debate:**
- Does the client believe their current process priority is Speed (AI approvals in 5 minutes) or Empathy (a human holds their hand through the process)? The AI must establish the intended operational model so the Conducting agent can test if it actually worked.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your new "Automated AI Claims Bot" is causing massive anxiety because customers refuse to trust a bot with $50,000 of damage, will you add an immediate "Talk to Human" override, or just try to make the bot smarter?
- If customers report that the documentation requirements feel intentionally punishing (acting in bad faith), what specific forms will you eliminate from the legal requirement?

**Well-formed decision map example:**
> Claims outcome: If the data shows that the 'First Notice of Loss' phone call is perceived as an interrogation rather than an offer of help, the training department will entirely rewrite the adjusters' initial scripts. If the primary driver of churn is the speed of the final payout check, the digital product team will prioritize instant direct-deposit API integration.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Procedural Friction & Paperwork | 25% | Root | 0.85 |
| Empathy & Advocacy (The Human Element)| 20% | Root | 0.85 |
| 'Bad Faith' Perception / Institutional Trust| 20% | Root | 0.80 |
| Payout Fairness vs Expectations | 20% | Root | 0.85 |
| Resolution Speed & Communication | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The First-Timer vs The System Expert: The brief must establish if the claimant has gone through this before. A first-timer is terrified; an expert (like a fleet manager) is just annoyed by inefficiency.

# Section 7: Constitutional Constraints
1. **The 'We Did Our Job' Ban.** The AI must never validate a brief that asks "Why are they angry? We technically paid the claim within the legal 30-day window." The AI must force the client to accept that satisfying the legal requirement is the floor, not the ceiling. If the customer felt abused during those 30 days, the brand relationship is dead.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Pulse Check on a Minor Auto Claim | Low | 15–20 mins |
| App vs Human Filing Process Comparison | Moderate | 25–35 mins |
| Catastrophic Loss (Property/Medical) | Severe | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Claim type and vulnerability level established
- [ ] Institutional priority (Empathy vs Efficiency) documented
- [ ] Audience baseline (First-Timer vs Expert) bounded
- [ ] Decision map outcome actions recorded for Claims Ops Team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Trauma Intervention:** If a respondent discussing a major medical or property loss claim becomes severely distressed or emotionally compromised, Convy must execute an immediate graceful exit, overriding all operational models and prioritizing human safety.

## Inbound bridging nodes
When Insurance Claims is added as a secondary domain:
- `BRIDGE-fnic-cxcs-compassion-fatigue` (Activated when added to Customer Support to determine if the front-line call center workers have entirely lost the ability to sound empathetic because they process 100 tragedies a day)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most confusing piece of paper or form you force a customer to sign during a claim?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-fnic-*` node, giving the Conducting agent a specific target to audit regarding 'Procedural Friction'.
