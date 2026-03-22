---
name: Clinical Trial Research (Analytics)
description: Analytics agent skill for interpreting Clinical Trial Experience. Focuses on quantifying 'Logistical Dropout Risk', identifying 'Lab Rat' syndrome, and flagging hidden non-adherence.
id: sr-clinical-trial-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Clinical Trial Experience data is the operational integrity scan of a multi-million-dollar scientific investment. If patients drop out of a trial, the scientific data is ruined, the timeline is delayed, and millions of dollars are lost. The Analytics agent must synthesize the transcripts to identify exactly *why* patients are thinking about quitting. It must differentiate between biological failure (the drug makes them too sick) and operational failure (the parking at the clinic costs $40 a day and they're going broke). The agent must ruthlessly expose operational failures that are sabotaging the science.

# Section 2: Coverage Interpretation Guide
**The Trial Experience Matrix:**
- High Empathy, Low Friction: The Ideal Cohort. Patients feel cared for and the logistics are easy. Retention will be near 100%.
- High Empathy, High Friction: The Enduring Cohort. The process is a nightmare (bad app, long commutes), but the nurses are so amazing the patients stay anyway out of loyalty. 
- Low Empathy, Low Friction: The Sterile Cohort. It's easy to do, but nobody cares. High risk of non-adherence (ghosting) because there is no human connection tying them to the study.
- Low Empathy, High Friction: The Collapse. Patients are treated like numbers and the logistics are impossible. Guaranteed mass drop-outs.

# Section 3: Quality Weighting Rules
**The 'Hidden Non-Adherence' Multiplier:** Feedback explicitly admitting that the patient lied to the trial coordinator, skipped doses, or faked app-diary entries because they were afraid of being kicked out (or just too tired) is weighted at 5x. This is the single most dangerous data point in clinical research because it invalidates the biological conclusions of the trial.

# Section 4: Benchmark Context
**The "Cure vs Care" Base:** The Analytics agent must determine if the trial site is functioning as a "Laboratory" (we only care about your bloodwork) or a "Care Center" (we care about how your bloodwork makes you feel). Clinical sites that operate solely as Laboratories suffer massively higher dropout rates among marginalized demographics. 

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Trial phase, demographic bounds, therapeutic area (e.g., Phase 3 Oncology).
**Section 2: Executive Summary**
The definitive diagnosis of the Trial Matrix (e.g., "A High-Friction Cohort Saved Only by Nurse Empathy").
**Section 3: The 'Logistical Dropout' Audit**
Specific measurement of the financial and time burden threatening retention (e.g., out-of-pocket travel costs).
**Section 4: The 'Hidden Non-Adherence' Log**
Granular analysis of exactly what patients are hiding from the PI and why.
**Section 5: Decision Map Response**
Direct mapping to the decentralized trial tools, reimbursement policies, or staff training requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section. MUST include a disclaimer that this data is qualitative UX and does not constitute pharmacovigilance or adverse event reporting.

# Section 6: Multi-Session Analysis Guide
Analyze the "Consent Comprehension Gap." If 80% of transcripts indicate that patients signed the Informed Consent document but fundamentally misunderstood whether they could be placed on a placebo, the Analytics agent must flag a severe ethical and operational vulnerability to the Institutional Review Board (IRB) coordinator.

# Section 7: Flagging and Limitation Language
**When severe 'Hidden Non-Adherence' is detected:**
"Synthesis of the patient experience data reveals a critical 'Hidden Non-Adherence' vulnerability actively compromising the trial's dataset. Across [Percentage]% of evaluated patients, the fear of being deemed 'non-compliant' and removed from the trial has created a culture of 'White Coat Silence.' Patients explicitly admitted to underreporting side effects and falsifying daily diary entries because the reporting UX is burdensome and punitive. The trial's retention metrics currently look healthy, but the biological data being collected is heavily contaminated by this behavioral hiding. We strongly advise an immediate 'Amnesty Protocol' communication from the Principal Investigator, stating unequivocally that honest reporting will not result in trial removal."
