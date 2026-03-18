---
name: Service Recovery Research (Analytics)
description: Analytics agent skill for interpreting Service Recovery Research sessions. Covers trust restoration analysis, functional versus emotional resolution interpretation, quality handling including gratitude confound, benchmark contextualization, output format, and limitation language for complaint resolution and trust-rebuilding research.
id: cx-service-recovery-analytics
version: 1.0.0
---

## Section 1: What This Domain's Data Actually Means

Service Recovery Research data is about trust, not just problem resolution. The functional resolution — was the problem fixed? — is a floor condition that must be met before the research's actual questions can be asked. The primary analytical question is what the handling of the recovery did to the customer's trust in the brand's ability to look after them when things go wrong. This is different from whether the customer is satisfied with the outcome. A customer who received a refund but was made to work for it across four contacts with three different staff members has had a functional resolution and a failed recovery. A customer whose minor problem was resolved by a single staff member who took genuine ownership and followed through on a commitment has had a functional resolution and a successful recovery. These produce different findings and different interventions.

**The service recovery paradox and when to report it:** When the session documents a customer whose trust is now higher than before the failure — whose recovery was so well-handled that it produced a positive impression that exceeds what the ordinary positive experience would have created — this is the service recovery paradox. It should be reported explicitly when documented, because it contains the highest-value training data in the domain: the specific behaviors that produced it. The Analytics agent must not aggregate this finding away into a general "positive recovery" category. The exact behaviors — the specific phrases, the specific actions, the specific timing — must be preserved and reported.

**The functional-emotional divergence is the most common and most underreported finding:** When the functional resolution was positive but the emotional resolution was insufficient — the problem was fixed but the customer left feeling that the brand did not genuinely care — this divergence is not reported by customers unless directly probed. Customers do not spontaneously say "the problem was fixed but the experience left me cold." They say "it was sorted out" and move on. The Analytics agent must read this divergence from the session content when it is present: functional resolution coverage at high confidence combined with emotional resolution coverage at low confidence, or emotional restoration language that is flat rather than warm. Report this pattern explicitly — it is the most common service recovery failure type and the one most likely to produce slow trust erosion.

**What the gratitude confound looks like:** When the Conducting agent flagged compensation-related positivity, the Analytics agent must separate the compensation effect from the genuine recovery quality. A post-recovery trust score that is elevated primarily by a generous compensation gesture is not evidence of excellent recovery — it is evidence of effective bribery. These findings must be reported differently: "Post-recovery trust appears elevated; however, the session reliability indicators suggest this elevation is partially attributable to the compensation gesture rather than the quality of the recovery experience itself."

**What high customer effort with positive functional resolution means:** When the customer had to work significantly to achieve resolution — multiple contacts, repeated problem re-description, escalation required — this is a recovery process failure even when the eventual outcome was positive. Customers who achieved resolution through their own persistence rather than through the brand's responsive process have not experienced a recovery; they have experienced attrition. This finding has a specific intervention implication: the brand needs to reduce customer effort in the recovery process regardless of the functional resolution quality.

---

## Section 2: Coverage Interpretation Guide

**Failure Experience — high severity, Recovery Process — adequate:**
The higher the failure severity, the higher the bar for what "adequate recovery" means. A recovery that would restore trust after a minor inconvenience may fail to restore trust after a significant failure. Always contextualize recovery quality findings against the failure severity documented in the session.

**Help-Seeking — high customer effort:**
When the customer effort to reach the first contact was high — difficult to find the channel, long wait, unhelpful initial routing — this is a recovery failure that occurred before the recovery even began. The emotional state the customer arrived in at the first contact conversation was already depleted. Any positive findings about the recovery interaction itself must be contextualized against this depleted entry state: the staff member who produced a good interaction was recovering from a deficit, which makes their behavior even more analytically significant.

**Staff Ownership — high confidence, Staff Empathy — low confidence:**
This pattern indicates a staff member who solved the problem efficiently but failed to acknowledge its impact on the customer. The functional outcome may be positive, but the emotional restoration is likely incomplete. This is a training finding: the staff have the capability for action without the corresponding emotional vocabulary for acknowledgment.

**Staff Empathy — high confidence, Staff Ownership — low confidence:**
The inverse pattern — acknowledging the customer's distress without taking responsibility for solving it — is typically the more frustrating customer experience of the two. Sympathy without action is experienced as dismissive. Report this pattern explicitly as a staff training finding: acknowledgment skills are present but ownership behavior is absent.

**Emotional Resolution — low confidence despite high functional resolution:**
This is the most analytically significant divergence finding in the domain. When the functional resolution is complete and the emotional resolution is low, the brand has solved the problem but failed the recovery. The customer's trust level is lower than the functional outcome would suggest, and the retention risk is higher. This finding requires explicit reporting — it is invisible in standard complaint satisfaction surveys and is only detectable through qualitative research.

**Post-Recovery Trust — elevated above pre-failure:**
Service recovery paradox confirmed. Report the specific behaviors that produced it. This is the highest-value training content the domain can produce.

**Post-Recovery Trust — neutral (returned to pre-failure level):**
Adequate recovery. The brand has restored the relationship to baseline. This is a minimally acceptable outcome — it is not a success story, but it is not a failure. Note that the customer's retention is secured but their advocacy is not enhanced.

**Post-Recovery Trust — reduced below pre-failure level:**
Failed recovery. The handling made things worse than the failure alone would have. This is the most urgent finding type and must be reported as a priority regardless of how other nodes performed. A brand that is consistently failing to restore trust after failures is experiencing accelerating churn from its own recovery process.

---

## Section 3: Quality Weighting Rules

**Sessions with confirmed compensation-related positivity:**
Weight down positive emotional resolution and trust scores. The compensation effect must be notionally removed before the recovery quality can be assessed. When the gratitude confound probe was deployed and produced a shift in the respondent's honest assessment, use the post-probe account as the primary analytical data.

**Sessions with high failure severity:**
Weight up the findings from these sessions relative to low-severity sessions when reporting trust restoration findings. A recovery that restored trust after a significant failure is more analytically meaningful than a recovery that restored trust after a minor inconvenience. Do not treat these equally in aggregate analysis.

**Sessions where customer effort was high but outcome was positive:**
The positive outcome does not offset the customer effort failure. Report the effort findings separately from the outcome findings. The fact that the customer achieved resolution does not mean the recovery was good — it means the customer was persistent enough to achieve it despite the process.

**Sessions where the Conducting agent noted the session was emotionally depleted (severe failure type):**
Treat coverage gaps in these sessions as potentially reflecting the respondent's emotional management rather than absence of experience. Where coverage on the trust trajectory node is low in a high-severity failure session, note this explicitly rather than treating it as equivalent to a low-coverage finding in a mild failure session.

---

## Section 4: Benchmark Context

**Category segmentation is required:** Service recovery benchmarks vary dramatically by category. Hospitality service recovery expectations are structurally different from retail return experience expectations, which differ from software support resolution expectations. Never apply cross-category benchmarks without explicit segmentation.

**First-contact resolution rate:** The proportion of recoveries resolved at first contact is one of the strongest predictors of customer effort score and emotional restoration. Benchmark this metric by category and compare the session findings against it — a brand whose recovery typically requires multiple contacts has a structural effort problem regardless of eventual resolution quality.

**Emotional restoration rate by resolution type:** Benchmark the emotional restoration rates associated with different resolution types (refund, replacement, apology, compensatory gesture). A refund that does not acknowledge the impact of the failure produces lower emotional restoration than an acknowledgment plus a smaller gesture. The benchmark data helps contextualize whether the client's resolution type mix is likely to produce emotional restoration or merely functional resolution.

**Time-to-resolution benchmarks:** These must be segmented by failure type and category. A 24-hour billing error resolution time is excellent in some categories and unacceptable in others. Do not cite time-to-resolution benchmarks without category-appropriate comparison.

**The service recovery paradox prevalence benchmark:** The rate at which service recovery produces paradox-level outcomes (trust above pre-failure) is a useful benchmark for training effectiveness. When this domain produces a paradox-level finding, benchmark it against the category rate to contextualize whether this is exceptional performance or category-typical.

---

## Section 5: Output Format Specification

**Section 1: Study Parameters**
Failure type, recovery type, recency, customer profile, failure severity characterization, compensation history of participants, brand's stated recovery policy. Factual only.

**Section 2: Executive Summary**
Two to four sentences. Primary finding: what happened to trust, and what drove it? Did the recovery produce functional resolution only, or did it produce emotional restoration? Was the service recovery paradox documented? Connect to the decision map's relevant outcome.

**Section 3: Failure Characterization**
What the failure was, its severity, and the emotional impact at point of discovery. This section sets the analytical baseline — the starting point for trust trajectory measurement. Note the failure severity so that recovery quality findings are appropriately contextualized.

**Section 4: Recovery Process Analysis**
Four sub-sections, each independently analyzed:
- Help-seeking ease: How hard was it to reach the recovery channel?
- First-contact quality: What was the emotional and practical quality of the initial contact?
- Staff ownership and empathy: Were these present, and were they the same or different?
- Communication during recovery: Was the customer kept informed?
Note the customer effort sub-finding — how much work did the customer do to achieve resolution?

**Section 5: Resolution Analysis**
Functional resolution: was the problem fixed? Emotional resolution: did the brand demonstrate that it cared? If these diverge, report the divergence as a primary finding with the specific intervention implication.

**Section 6: Trust Trajectory**
The primary outcome section. Pre-failure trust baseline (as established in the session), post-recovery trust level, and the characterization: restored, elevated (paradox), reduced, or neutral. If paradox-level, document the specific behaviors that produced it. If reduced, identify which stage of the recovery produced the trust deterioration.

**Section 7: Improvement Data**
What the excellent version of the recovery would have looked like — from the excellence probe. Present this as a specific description of the target behavior or outcome, not as a general recommendation. "The respondent described the excellent version as [specific description]" is the correct framing.

**Section 8: Decision Map Response**
Map each finding to its decision map entry. Address every entry.

**Section 9: Limitations and Confidence Notes**
Required. Use the specific language from Section 7.

---

## Section 6: Multi-Session Analysis Guide

**Trust trajectory patterns across sessions:**
When multiple sessions show the same trust trajectory — e.g., all sessions show functional resolution with incomplete emotional restoration — this is a systemic pattern indicating that the brand's recovery process produces functional but not emotional outcomes systematically. This implies a training intervention: staff have the capability to fix problems but not the capability (or the permission) to restore emotional trust.

**Service recovery paradox prevalence:**
Count the proportion of sessions showing paradox-level outcomes and compare against category benchmarks. A paradox rate above category benchmark indicates a high-performing recovery culture. A paradox rate near zero indicates that the recovery process is designed for functional adequacy but not for trust elevation.

**Customer effort distribution:**
Across multiple sessions, the distribution of customer effort scores reveals whether high-effort recovery is systemic or episodic. If 70% of sessions document high customer effort despite eventual positive resolution, the process has a structural accessibility problem.

**Staff behavior patterns:**
Where multiple sessions document the same specific ownership or empathy behavior as the trust-restoration factor, these behaviors are the primary training content for the brand's service recovery program. They should be reported as a set with specific examples.

---

## Section 7: Flagging and Limitation Language

**When functional-emotional divergence is present:**
"This session documents the most common form of service recovery failure: functional resolution with insufficient emotional restoration. The problem was resolved, but the handling of the recovery did not demonstrate genuine care for the customer's experience. The respondent's trust level post-recovery reflects this divergence — it is [characterization] despite the positive functional outcome. The specific behavior gap was [ownership / empathy / communication / follow-through], and the intervention implication is [training / process / communication design]."

**When the service recovery paradox is documented:**
"This session documents a service recovery paradox outcome: the respondent's trust in [brand] is now higher than it was before the failure occurred. This is an analytically high-value finding. The specific behaviors that produced this outcome were [exact behaviors from session]. These behaviors should be documented as training benchmarks — they represent the specific actions that converted a failure into a trust-building event."

**When gratitude confound is present:**
"Post-recovery trust scores in this session are partially attributable to the compensation gesture received before the session, which the Conducting agent flagged as producing a gratitude confound. The honest assessment, elicited after the confound probe, indicated that the recovery process quality was [characterization] independent of the compensation gesture. The compensation appears to have resolved the functional outcome but did not substitute for the emotional recovery experience."

**When customer effort was high:**
"The respondent achieved functional resolution only after [number of contacts and characterization of effort]. The recovery process required the customer to drive toward resolution rather than the brand taking proactive ownership of it. This constitutes a recovery process failure regardless of the eventual functional outcome. The intervention implication is [specific process change — proactive follow-through mechanism / reduced contact requirement / first-contact resolution investment]."

**When recovery completion status is uncertain:**
"The recovery episode's completion status could not be confirmed with certainty in this session. The trust trajectory finding is provisional — the respondent's current trust assessment may shift once the recovery is fully resolved. This session's findings should be treated as indicative rather than final."