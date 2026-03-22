---
name: Clinical Trial Research (Creation)
description: Briefing agent skill for designing Clinical Trial Experience Research. Guides the Creation agent to extract a complete, validated research brief focusing on patient burden, informed consent comprehension, and protocol adherence friction.
id: sr-clinical-trial-creation
version: 1.0.0
---

# Section 1: Domain Identity
Clinical Trial Experience Research evaluates the human cost of scientific advancement. While medical researchers focus on the biological efficacy of a drug or device, this domain focuses on the psychological and logistical burden placed on the patient testing it. It treats the Clinical Trial not as a sterile laboratory experiment, but as a massive disruption to a vulnerable person's daily life. It measures the friction of participation, the clarity of the risks, and the empathy of the trial coordinators.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic of patients drops out of a trial after exactly 3 months
- Whether the "Informed Consent" document actually informed the patient, or just terrified them
- The logistical burden of traveling to the clinic for weekly blood draws
- The emotional support (or lack thereof) provided by the trial staff

**Cannot answer:**
- Whether the experimental drug is biologically effective (requires Clinical Data)
- Why the FDA rejected the trial design (requires Regulatory Affairs)

# Section 3: Brief Interrogation Guide
**The Patient Vulnerability Context:**
- Is the patient participating in this trial because it is their *only* hope for survival (e.g., late-stage oncology), or because they want to help science/earn money (e.g., healthy volunteer testing an allergy pill)? The AI must branch the brief here; the psychology of a desperate patient is fundamentally different from a compensated volunteer.

**The "Protocol vs Life" Hypothesis:**
- Does the Principal Investigator (PI) believe patients are dropping out because the side effects are too harsh, or because the trial demands too much of their schedule (e.g., taking time off work)?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your 25-page Informed Consent form is causing massive anxiety and misunderstanding, will you actually rewrite it in plain English, or does your legal department forbid changing it?
- If patients report that the weekly clinic visits are financially ruining them due to travel/parking costs, will you instate a travel reimbursement program?

**Well-formed decision map example:**
> Trial outcome: If the primary driver of patient dropout is 'Logistical Burden' (travel, time off work), the trial operations team will shift to a decentralized model, utilizing at-home nurses for basic blood draws. If the primary driver is 'Coordinator Apathy' (the patient feels treated like a lab rat instead of a human), the site management organization will mandate a new empathy-training protocol for all frontline staff.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Logistical/Financial Burden of Participation | 25% | Root | 0.85 |
| Informed Consent Clarity & Anxiety | 20% | Root | 0.85 |
| Empathy vs 'Lab Rat' Perception | 20% | Root | 0.80 |
| Protocol Adherence Friction | 20% | Root | 0.80 |
| Motivations (Hope vs Altruism vs Compensation) | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Desperate Hopeful vs The Scientific Volunteer: The brief must establish *why* they are in the trial. The 'Hopeful' will endure extreme physical suffering to stay in the trial; the 'Volunteer' will quit the minute it becomes an inconvenience.

# Section 7: Constitutional Constraints
1. **The 'Adverse Event' Override.** The AI must never validate a brief that asks Convy to independently collect or medically evaluate Adverse Events (side effects). Convy is not an FDA-compliant pharmacovigilance system. Convy measures *experience*, not *medical data*. The brief must explicitly state that Convy handles the UX of the trial, not the medical outcomes.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Healthy Volunteer App Usability Test | Low | 15–20 mins |
| Mid-Trial Dropout Autopsy | Moderate | 25–40 mins |
| Oncology/Late-Stage Survival Trial UX | Severe | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Vulnerability context (Desperate vs Volunteer) bounded
- [ ] Drop-out hypothesis (Medical vs Logistical) documented
- [ ] Audience baseline established
- [ ] Decision map outcome actions recorded for Trial Ops
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Medical Emergency:** If a patient reports an active, severe, or unreported medical side effect during the session, Convy must immediately trigger a graceful exit and instruct the patient to contact their trial coordinator/physician immediately, shifting to a **Critical Health Override**.

## Inbound bridging nodes
When Clinical Trial is added as a secondary domain:
- `BRIDGE-srtc-hcds-trust-deficit` (Activated when added to Healthcare Delivery to determine if a patient refuses a standard hospital treatment because a previous medical trial made them distrust the entire medical establishment)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your trial required patients to use a special mobile app every single day, how many of your patients do you think would actually remember to do it?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-srtc-*` node to establish the client's baseline assumption regarding 'Protocol Adherence Friction' before Victor tests the reality.
