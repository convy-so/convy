---
name: Learning Outcome Research (Creation)
description: Briefing agent skill for designing Learning Outcome Research studies. Guides the Creation agent to extract a complete, validated research brief focused on behavioral change and skill transfer, not self-reported satisfaction.
id: el-learning-outcome-creation
version: 1.0.0
---

## Section 1: Domain Identity

Learning Outcome Research is a post-hoc study of what a learner can actually do differently as a result of a specific learning experience, conducted at a meaningful interval after the experience ends — typically 30, 60, or 90 days. The central research question is not "did you enjoy the course?" or "did you feel you learned?" but rather: what knowledge was retained, which skills were transferred to real work situations, and what behavioral change is observable? The study requires that enough time has elapsed for genuine transfer to have been tested in real conditions.

This domain is distinct from Course Evaluation Research, which captures the learner's perception of a course while the experience is still fresh or immediately after completion. It is also distinct from Professional Development Research, which studies the organizational ecosystem of employer-supported growth — the quality of mentorship, manager support, and career architecture — rather than the measurable output of a specific learning event. If a client says "I want to know if our training is working," that could mean course quality (Course Evaluation), organizational culture around development (Professional Development), or genuine behavioral output measurement (Learning Outcome). The Creation agent must determine which question the client is actually asking before building a brief. Learning Outcome Research is the correct domain only when the client wants evidence of behavioral change at a remove from the event itself.

---

## Section 2: Research Objectives This Domain Can and Cannot Answer

**This domain can answer:**
- Which concepts from a specific training event were retained and can be applied in context
- Which skills were transferred from the learning environment to real work situations
- Which behavioral changes are observable in how a learner approaches tasks, decisions, or interactions
- Where transfer failed — whether because the learning did not create the capability, or because the work environment prevented its application
- What the learner now does differently that they attribute directly to the training
- What blocked application of skills that were notionally learned
- Whether the time elapsed since training has eroded certain types of knowledge more than others

**This domain cannot answer:**
- Whether the course was well-designed, engaging, or well-facilitated (that is Course Evaluation Research)
- Whether the organization's broader learning culture supports development (that is Professional Development Research)
- How learners felt during the learning experience or whether they would recommend it
- Whether a learning program should be designed or redesigned (the domain produces evidence for that decision but is not itself a design consultation)
- Outcomes attributable to factors other than the specific training — general experience accumulation, management changes, or peer learning cannot be separated from training effects in a single qualitative session

---

## Section 3: Brief Interrogation Guide

The Creation agent must extract the following before marking the brief complete. These are organized by the expertState section they populate. The agent pursues these conversationally and in any order that emerges naturally; this is a requirements checklist, not a script.

**Study parameters:**
- What is the specific training or learning event being studied? (Name, format, duration, delivery method — in-person, e-learning, blended)
- When did the participant complete it? The Creation agent must confirm that sufficient time has elapsed for real-world application to have occurred. If less than three weeks have elapsed, the agent must flag this and ask whether Course Evaluation Research is actually what is needed.
- What is the target time window for the interview — 30-day, 60-day, or 90-day post-completion? This determines what kinds of application evidence are realistic to expect.

**Learning objectives:**
- What were the stated learning objectives of the program? The client must provide these — if they cannot, the brief cannot be completed because the Analytics agent will have no basis for measuring coverage of the intended learning.
- Which of those objectives are considered the highest priority — the ones where behavioral change matters most?
- What does "success" look like from the client's perspective? What would a learner be doing differently if the training had worked?

**Organizational context:**
- What is the learner's role, and what tasks or responsibilities should the training have improved?
- Are there organizational factors the client knows about that may have affected application — a restructure, a change in tools, a change in priorities since the training was delivered?
- Did the organization provide any post-training support — coaching, job aids, a manager follow-up conversation? This matters because if support existed and transfer still failed, the finding is different than if no support existed.

**Incomplete answer probes:**
- If the client gives vague objectives ("we want them to understand the principles"): "When you imagine a participant who went through the training and got full value from it — what would you see them doing in their work next week that they weren't doing before?"
- If the client cannot specify what success looks like: "Is there a specific decision, task, or interaction where you would expect to see a difference? Walk me through what that looks like."

---

## Section 4: Decision Map Interrogation

The decision map is where Learning Outcome Research most commonly fails at the briefing stage. Clients often frame the study as a measurement exercise without specifying what they will do with the findings. The Creation agent must extract a complete decision map before marking the brief complete.

**Questions to ask:**
- If the findings show strong behavioral transfer — learners are applying the skills and the training clearly worked — what decision does that inform? (Clients commonly have no answer because they assumed success; the agent must push.)
- If the findings show weak or no behavioral transfer — learners completed the training but are not applying it — what decision does that inform? Will the program be redesigned? Supplemented? Discontinued? Or is the investigation more organizational — about barriers to application rather than training quality?
- If findings are mixed — some objectives transferred and others did not — what is the decision logic? Is partial success sufficient, or does a failure on any critical objective trigger redesign?

**Well-formed decision map example:**
> Positive outcome: We confirm the program for rollout to the next cohort without modification.
> Negative outcome: We identify whether failure is in training design or application support, and redesign the relevant component.
> Mixed outcome: We redesign the modules corresponding to the objectives that failed to transfer, and keep the modules that worked.

**Poorly-formed decision map (flag and probe):**
> "We want to understand how well the training is working." — This is not a decision. Probe: "Understanding how it is working is valuable — but what will you do with that understanding? What changes depending on what you find?"

---

## Section 5: Coverage Model Specification

Version: 1.0.0

The following nodes constitute the required coverage model for Learning Outcome Research. The Conducting agent initializes the coverage tracker with these nodes from this specification.

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Knowledge Retention | 20% | Root | 0.75 |
| — Core concept recall | 10% | Knowledge Retention | 0.70 |
| — Detail accuracy | 10% | Knowledge Retention | 0.65 |
| Skill Transfer | 30% | Root | 0.80 |
| — Specific application instance | 20% | Skill Transfer | 0.80 |
| — Task or decision context | 10% | Skill Transfer | 0.75 |
| Behavioral Change | 25% | Root | 0.75 |
| — Observable difference from pre-training behavior | 15% | Behavioral Change | 0.75 |
| — Frequency and consistency of new behavior | 10% | Behavioral Change | 0.65 |
| Barriers to Application | 15% | Root | 0.70 |
| — Organizational barriers (tools, time, management) | 8% | Barriers to Application | 0.65 |
| — Individual barriers (confidence, memory, relevance) | 7% | Barriers to Application | 0.65 |
| Efficacy Belief | 10% | Root | 0.65 |
| — Confidence in using the skills going forward | 6% | Efficacy Belief | 0.60 |
| — Desire for further development in the area | 4% | Efficacy Belief | 0.60 |

Critical nodes (where Analytics confidence weighting is highest): Skill Transfer and Behavioral Change. If either reaches the end of the session with confidence below threshold, the Analytics agent must flag incomplete coverage on the primary research question.

---

## Section 6: Audience Model Interrogation Guide

**Psychographic dimensions that matter for this population:**
- Relationship to formal learning: Does the respondent value structured training, or do they primarily learn through doing and peer conversation? This shapes whether they frame their post-training experience in training vocabulary at all.
- Career stage: Early-career learners often have more training events to compare against but less real-world context for application. Senior professionals may have more real-world context but may have mentally attributed skill improvements to experience rather than to the specific training.
- Time since training: This is not just a parameter — it is an audience psychology variable. Respondents at 30 days are still motivated to reflect; respondents at 90 days may have lost the specific vocabulary of the course and need careful anchoring.

**Social desirability flags:**
- Respondents who were required to attend training (rather than self-selected) may feel they are being evaluated on whether they retained and applied it. The agent must establish early that the research is about the training design, not about the learner's performance.
- Respondents whose managers commissioned the research may perform positively regardless of genuine transfer. The Creation agent must ask: was participation in this study voluntary, and does the respondent know who commissioned it?

**Sensitivity flags:**
- If the training was remedial — assigned because the learner had a performance gap — discussing what they learned and applied may carry shame or defensiveness. The Creation agent must ask whether any portion of the participant population received the training as a performance intervention.

---

## Section 7: Constitutional Constraints

The following constraints are specific to Learning Outcome Research and must be satisfied before the brief can be marked complete.

1. **Time gap must be documented.** The brief must record the specific interval between training completion and the interview. If the interval is less than 21 days, the Creation agent must advise the client that behavioral transfer evidence is unlikely to be reliable at this interval and must confirm the client's rationale for proceeding.

2. **Learning objectives must be provided by the client.** Analytics cannot assess transfer against objectives that were not defined in the brief. The agent must not proceed to handoff without a stated list of objectives — inferring them from a training title is not acceptable.

3. **The study must be anchored to a specific training event.** Vague mandates like "our overall L&D program" cannot be covered in a single interview and will produce uninterpretable findings. The brief must name a specific course, module, or program with a defined completion point.

4. **The decision map must address the partial-transfer scenario.** It is not sufficient to define actions for full success and full failure. Mixed findings are the most common outcome in outcome research, and the client must specify the decision logic in advance.

---

## Section 8: Duration Calibration Guide

| Number of Primary Objectives | Minimum Session Duration | Notes |
|-------------------------------|--------------------------|-------|
| 1–2 | 25 minutes | Sufficient for a focused deep-probe on primary objectives only |
| 3–4 | 35–40 minutes | Standard scope; allows full coverage plus barriers probe |
| 5–6 | 50–55 minutes | Maximum recommended scope; respondent fatigue risk increases |
| 7+ | Not recommended | Advise client to prioritize objectives; more than 6 is not achievable in a single session with adequate depth |

If the client has more than six learning objectives and insists on covering all of them, the Creation agent must explain that attempting full coverage will result in shallow data on every objective rather than usable depth on any of them, and must assist the client in prioritizing the three to four most decision-critical objectives.

---

## Section 9: Handoff Checklist

The following expertState fields must be populated before the Creation agent sets status to `brief_complete`. Any empty required field returns the agent to the brief conversation.

- [ ] Training event: name, format, duration, delivery method
- [ ] Completion date and calculated time elapsed since training
- [ ] Full list of stated learning objectives (client-supplied, not inferred)
- [ ] Priority objectives flagged (top 2–3 if more than 4 total)
- [ ] Target role and task context of participants
- [ ] Post-training organizational support documented (coaching, job aids, manager follow-up)
- [ ] Any known organizational disruptions since training (restructures, tool changes, priority shifts)
- [ ] Social desirability risk flagged: whether attendance was mandatory and whether participants know who commissioned the study
- [ ] Sensitivity flag documented if any portion of participants received training remedially
- [ ] Decision map: positive, negative, and mixed outcome actions recorded
- [ ] Session duration target confirmed against calibration guide
- [ ] Coverage model version number recorded (1.0.0)