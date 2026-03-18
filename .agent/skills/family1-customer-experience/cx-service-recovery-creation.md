---
name: Service Recovery Research (Creation)
description: Briefing agent skill for designing Service Recovery Research studies. Guides the Creation agent to extract a complete, validated research brief focused on what happens after something went wrong and the customer sought help — whether the resolution rebuilt trust, and what made the recovery feel adequate or inadequate.
id: cx-service-recovery-creation
version: 1.0.0
---

## Section 1: Domain Identity

Service Recovery Research studies what happens after something went wrong and the customer attempted to get it resolved. The research question is: did the resolution rebuild trust, and what specifically made the recovery feel adequate or inadequate? This domain applies to any entity that handles complaints — which is every entity — but it is the correct domain only when the failure has already occurred and the recovery attempt has been made. Restaurants with food complaints, hotels with room issues, retailers with returns or damaged goods, airlines with disrupted journeys, software companies with support tickets, clinics with billing errors — all of these use this domain when they want to understand not just whether the problem was solved, but whether the customer's sense of the relationship survived the failure and its resolution.

This domain is distinct from Post-Transaction Research, which studies a transaction that went to plan. When a transaction involved a failure that the customer did not escalate for help — they simply had a bad experience and moved on — that is still Post-Transaction Research, because there was no recovery attempt. Service Recovery Research requires that the customer identified a problem and sought resolution, and that a resolution was attempted. The domain is concerned with the recovery process, not just the failure event.

This domain is also distinct from NPS & Customer Loyalty Research. A customer who experienced a failure and a recovery may now have a relationship with the brand that is stronger or weaker than before — but measuring that overall relationship is an NPS question. Service Recovery Research focuses narrowly on the recovery episode: what happened, how it was handled, and what that handling did to the customer's trust in the brand's ability to look after them when things go wrong.

The research literature on service recovery documents a well-established phenomenon sometimes called the service recovery paradox: customers who experience a failure that is resolved excellently sometimes end up with higher trust in the brand than customers who never experienced a failure at all — because the recovery proved that the brand genuinely cares and is capable. The Conducting agent in this domain is trained to probe for the conditions that produce this paradox versus the conditions that accelerate distrust.

---

## Section 2: Research Objectives This Domain Can and Cannot Answer

**This domain can answer:**
- What the failure was and how the customer experienced it at the moment of recognition
- What made the customer decide to seek help — what tipped them from tolerating the failure to escalating it
- How easy or difficult it was to find the right channel and initiate the recovery process
- What the experience of the recovery interaction itself was like — the staff behavior, the quality of communication, the sense of ownership vs. deflection
- Whether the resolution outcome — functional and emotional — met the customer's expectations
- What specifically made the recovery feel adequate or inadequate
- What the customer's trust in the brand looks like now, relative to before the failure
- What would have made the recovery excellent rather than merely acceptable

**This domain cannot answer:**
- Why the failure occurred in operational terms — this domain studies the customer experience of the failure and recovery, not the root cause of the operational failure
- Whether a failure event produced negative brand sentiment for customers who did not escalate (they belong in Post-Transaction Research)
- What the customer's overall relationship quality with the brand is beyond this episode (NPS & Customer Loyalty Research)
- Whether the failure was the brand's fault or a third-party's — the customer experience research cannot determine this, only document how it was perceived

---

## Section 3: Brief Interrogation Guide

**Failure and recovery definition:**
- What type of failure is being studied — a product failure, a service delivery failure, a billing or administrative error, a safety incident, a communication failure?
- Has the recovery attempt already concluded, or are some cases still in progress? The Creation agent must clarify this. Service Recovery Research studies completed recovery episodes. In-progress cases are in a different psychological state — the respondent's trust assessment is not yet final — and require a different research design. If the client has a mix, this must be flagged.
- How long ago did the failure and recovery occur? The ideal window is within four weeks — long enough for the respondent to have processed the experience, short enough to recall it in detail. After three months, specific interaction details are typically unavailable and the research can only capture the residual trust impact rather than the process experience.

**Recovery context:**
- What resolution types are common in this domain — refunds, replacements, apologies, compensatory gestures, policy changes? The brief must document the range of resolution types so Analytics can interpret findings in context.
- What is the brand's stated service recovery policy — what are staff supposed to do when a failure is reported? Analytics uses this to assess the gap between policy and enacted recovery.
- Were any of the recovery cases escalated beyond first-contact resolution — to a manager, a second tier, a formal complaints process? If so, the coverage model must weight the recovery process node more heavily.

**Customer population:**
- What is the profile of customers in the study — tenure, segment, channel through which they originally had the failure? Long-tenured customers who experience a first failure are in a structurally different psychological position from customers who have had multiple failures. This affects the trust trajectory analysis.
- Were any customers offered compensation or a resolution gesture before agreeing to participate in the research? If so, the brief must note this because it is a significant confound for post-recovery trust measurement.

**Incomplete answer probes:**
- If the client is vague about what the recovery process involved: "Walk me through what typically happens when a customer comes to you with this type of problem. What does the first contact look like, and what does the resolution look like?"
- If the client cannot describe their service recovery policy: "When a staff member receives a complaint — what are they supposed to do? Is there a script, a process, a set of options they can offer?" If there is no stated policy, this is itself a finding context that Analytics must know about.

---

## Section 4: Decision Map Interrogation

**Questions to ask:**
- If the research shows that recoveries are consistently leaving customers with less trust than before — the process is functional but the emotional restoration is failing — what decision does that inform? Training for service staff? Process redesign? Communication script changes?
- If the research shows a specific stage of the recovery process is failing consistently — e.g., the initial contact is difficult to reach, or the resolution takes too long, or the staff member does not take ownership — what decision does that inform?
- If the research shows that excellent recoveries are possible (the service recovery paradox is documented in some cases) but inconsistent — what decision does that inform? It implies that the brand has the capability to recover excellently but lacks the consistency of execution.
- If the research shows that some failure types recover better than others — what does the client do with a differential finding across failure categories?

**Well-formed decision map example:**
> Positive finding (recovery leaving customers with restored or elevated trust): Document the recovery behaviors that produced this outcome and incorporate them into service training standards.
> Negative finding (recovery process competent but emotional restoration absent): Redesign the emotional recovery elements — ownership language, empathy behaviors, follow-through gesture — while retaining the functional process.
> Mixed finding (functional resolution adequate, process experience was poor — too hard to reach, too slow): Address the access and speed failures specifically without redesigning the resolution itself.

---

## Section 5: Coverage Model Specification

Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Failure Experience | 15% | Root | 0.75 |
| — Nature and severity of the failure | 8% | Failure Experience | 0.70 |
| — Emotional impact at point of failure | 7% | Failure Experience | 0.70 |
| Help-Seeking Experience | 20% | Root | 0.75 |
| — Ease of finding the right channel | 10% | Help-Seeking | 0.75 |
| — First-contact experience | 10% | Help-Seeking | 0.70 |
| Recovery Process Experience | 25% | Root | 0.80 |
| — Staff ownership and empathy behavior | 12% | Recovery Process | 0.80 |
| — Communication quality and timeliness during recovery | 8% | Recovery Process | 0.70 |
| — Sense of effort required by the customer | 5% | Recovery Process | 0.65 |
| Resolution Outcome | 20% | Root | 0.80 |
| — Functional resolution: was the problem actually fixed | 12% | Resolution Outcome | 0.80 |
| — Emotional resolution: did the customer feel the brand genuinely cared | 8% | Resolution Outcome | 0.75 |
| Post-Recovery Trust | 20% | Root | 0.75 |
| — Current trust level relative to pre-failure | 12% | Post-Recovery Trust | 0.75 |
| — Likelihood to remain a customer | 5% | Post-Recovery Trust | 0.65 |
| — What would have made the recovery excellent | 3% | Post-Recovery Trust | 0.60 |

Critical nodes: Recovery Process — Staff Ownership and Empathy Behavior, and Resolution Outcome — Emotional Resolution. These two nodes are where service recovery most commonly fails despite functional adequacy. A problem that is solved mechanically but without any sense that the brand cares is worse than a problem that is solved slowly but with genuine warmth and ownership. These nodes are the primary analytical interest of this domain.

---

## Section 6: Audience Model Interrogation Guide

**Psychographic dimensions that matter:**
- Failure severity: Customers who experienced a minor inconvenience are in a structurally different psychological position than customers who experienced a safety issue, a significant financial loss, or a repeated failure. Severity shapes the threshold for what constitutes adequate resolution.
- Customer tenure: A long-tenured customer experiencing a first failure has significant prior positive equity to draw on. The failure must be severe or the recovery must be very poor to substantially damage the relationship. A new customer experiencing a failure in their first interaction has no equity — the recovery is the entirety of their brand experience.
- Recovery outcome: Customers who received a full resolution — the problem was fixed to their satisfaction — are in a different emotional position than customers who received a partial resolution or a compensatory gesture that did not address the root failure. The brief must document whether the client has pre-screened for resolution outcome.

**Social desirability flags:**
- Customers who received compensation or a resolution gesture as part of their recovery may feel a degree of obligation toward the brand — their criticism may be softened by gratitude for the compensation. The Creation agent must ask whether any participants received compensation before participating in the research.
- Customers who were invited to participate by the brand may perceive the research as an extension of the recovery relationship — they may moderate negative feedback because they associate the interview with the brand's recovery effort.

**Sensitivity flags:**
- Some failure types involve significant distress — a safety incident, a major financial error, a medical service failure. These respondents may be recounting an experience that was genuinely traumatic. The brief must flag failure severity so the Conducting agent can approach these sessions with appropriate care and does not treat them as standard service complaint research.
- Customers who have an unresolved grievance — the recovery is not complete or they feel it was inadequate and have not accepted it — may use this research as a final opportunity to escalate. The brief must document whether any participants are in this position and how the Conducting agent should handle active escalation signals.

---

## Section 7: Constitutional Constraints

1. **Recovery completion status must be confirmed.** The brief must state that all study participants have completed the recovery episode. In-progress cases must be excluded or studied separately with an explicit flag that the trust assessment is provisional.

2. **Failure severity range must be documented.** Analytics cannot contextualize trust trajectory findings without knowing the severity of the failures being studied. Minor failures that restore fully are not comparable to major failures that restore partially — the client must not draw equivalences across these without this context.

3. **Pre-research compensation must be documented.** If any participants received a recovery gesture or compensation before agreeing to participate, this must be recorded. Post-compensation goodwill bias can inflate post-recovery trust scores and must be flagged in Analytics.

4. **The brand's stated recovery policy must be documented.** Without knowing what the brand is supposed to do when a failure is reported, Analytics cannot assess whether the failure was a policy failure (policy inadequate) or an execution failure (policy adequate but not followed). Both are real findings with different decision implications.

5. **Failure types must be characterized.** A single study that mixes minor administrative failures with severe service failures will produce analytically confounded findings. The brief must identify whether the study is focused on a specific failure type or a range, and if a range, must note the distribution.

---

## Section 8: Duration Calibration Guide

| Failure Severity | Recovery Complexity | Minimum Session Duration |
|------------------|---------------------|--------------------------|
| Minor (inconvenience) | Single contact, quick resolution | 25–30 minutes |
| Moderate | Multi-stage resolution or escalation | 35–40 minutes |
| Significant | Multi-stage, multi-contact, compensation involved | 45–50 minutes |
| Severe (distressing failure type) | Any | 50–60 minutes, with pacing adjustments |

Severe failure type sessions require additional warmup time to establish emotional safety and may produce shorter answers during the failure description stage as the respondent manages emotional engagement with the memory. The Conducting agent must not rush these sessions.

---

## Section 9: Handoff Checklist

- [ ] Failure type documented: product, service delivery, billing, safety, communication
- [ ] Recovery completion confirmed: all participants have completed the recovery episode
- [ ] Recovery recency documented: time elapsed since recovery completed
- [ ] Recovery types in scope documented: refunds, replacements, apologies, gestures
- [ ] Brand's stated service recovery policy recorded
- [ ] Escalation history documented: proportion of cases that went beyond first contact
- [ ] Failure severity range characterized and noted
- [ ] Customer tenure profile documented
- [ ] Pre-research compensation flag: noted if any participants received gestures before participating
- [ ] Participant recruitment channel documented and brand-association confound flagged
- [ ] Sensitivity flags documented: distressing failure types; active unresolved grievance participants
- [ ] Decision map: positive (trust restored), negative (functional but emotionally inadequate), mixed (stage-specific failure in process) outcome actions recorded
- [ ] Session duration target confirmed against calibration guide, with severity adjustment noted
- [ ] Coverage model version number recorded (1.0.0)