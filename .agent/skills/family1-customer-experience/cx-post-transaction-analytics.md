---
name: Post-Transaction Research (Analytics)
description: Analytics agent skill for interpreting Post-Transaction Research sessions. Covers journey-stage gap analysis, expectation source interpretation, quality handling, benchmark contextualization, output format, and limitation language for transaction journey and expectation-versus-reality research.
id: cx-post-transaction-analytics
version: 1.0.0
---

## Section 1: What This Domain's Data Actually Means

Post-Transaction Research data is about the gap between what a customer expected at each stage of a transaction and what they actually experienced. The Analytics agent's central interpretive move in this domain is not "was the experience good or bad?" — it is "where did the experience diverge from expectation, and what produced that divergence?" These two questions yield categorically different findings and categorically different client actions.

**The delivery-versus-promise distinction is the primary analytical divide.** When a gap is identified between expectation and reality, the analytically critical question is whether the failure was in execution (the brand failed to deliver what it said it would) or in communication (the brand delivered what it said, but the customer understood something different from what was said). A photography-generated expectation gap on product quality is a marketing and communication failure. A delivery arriving in nine days when five was promised is an operational failure. Treating these equivalently produces a finding that implies the wrong intervention.

**What a positive overall sentiment with a specific stage failure means:** Many respondents who give broadly positive post-transaction assessments have specific journey stages they found frustrating — they have mentally averaged or discounted these. The Analytics agent must not report "customer satisfied with transaction" when a specific stage failure has been documented in the session, even if the respondent's overall sentiment was positive. Stage-level findings are more actionable than overall sentiment and must be reported on their own terms.

**What "it was fine" sessions mean:** Sessions where the respondent gave consistently positive but thin answers — no specific instances, no spontaneous qualifications, no emotional content at any stage — indicate either a genuinely unremarkable transaction with no memorable elements, or commitment bias suppressing honest assessment. The Analytics agent must distinguish between these by checking the session's reliability score and social desirability flags. A session with uniformly positive answers and a reliability score below 0.60 is more likely bias than genuine satisfaction.

**What a missing expectation baseline means:** If the Pre-Purchase Expectation Baseline node ended below threshold and the Conducting agent flagged that expectations could not be established, the session cannot support expectation-versus-reality analysis. The Analytics agent must report the session's other findings while explicitly flagging this limitation. Do not attempt to reconstruct expectations from the experience description — this introduces interpretation error.

**What normalization of recurring failure means:** When a respondent has explicitly normalized a failure — "the delivery is always slow with them, I just expect that now" — this is a more damaging finding than active dissatisfaction. Active dissatisfaction implies the customer still cares. Normalized failure implies the brand has trained its customers to expect less than they originally paid for. Report this pattern explicitly.

---

## Section 2: Coverage Interpretation Guide

**Pre-Purchase Expectation Baseline — low confidence:**
If low, the gap analysis across all subsequent nodes is unreliable. The entire finding structure of the session is compromised. Report the stage-level descriptions as observations but note that without an expectation baseline they cannot be characterized as gaps or confirmations — they are simply accounts of what happened. The decision map cannot be fully served by this session.

**Purchase Experience — high confidence with friction identified:**
Checkout or booking friction is often underweighted by clients who assume it is a digital product problem rather than a customer experience problem. If friction is documented at the purchase stage, it is a retention risk even if the subsequent stages were positive — customers who find committing to a brand difficult are less likely to return regardless of what they received. Report purchase friction as a category that affects repeat transaction likelihood, not just first-impression quality.

**Fulfillment Accuracy — failure documented:**
A fulfillment accuracy failure — receiving something different from what was ordered — is the highest-severity finding in this domain. It represents a fundamental transaction failure and must be reported as the primary finding regardless of how other stages performed. Note whether the failure was in the brand's own operations or attributed by the respondent to a third-party fulfillment partner — the decision implication differs.

**Fulfillment Communication — low confidence with long fulfillment period:**
If the fulfillment period was long (days rather than hours) and communication coverage is low, this is likely a significant finding even if the respondent did not explicitly complain about it. Anxiety during unexplained wait periods is well-documented and affects post-transaction sentiment even when the eventual outcome was positive. Flag this node's gap as a likely contributor to any negative post-transaction sentiment finding.

**First Use Gap — high confidence:**
When the first use gap analysis is rich — specific, named, with both an expectation and an experience clearly described — this is the most analytically valuable node in the session. The gap finding directly implies a specific intervention. Report it with the full description of both sides of the comparison. If the source of the expectation was also identified, include this and characterize the intervention implication explicitly.

**Post-Transaction Sentiment — positive, convergent with stage findings:**
When the overall sentiment is positive and stage-level findings are also consistently positive, this is genuine confirmation. Report it as such, but note the marginal improvement finding from the improvement probe — even satisfied customers describe a better version of the transaction, and this is the most action-relevant data for a client whose journey is broadly working.

**Post-Transaction Sentiment — positive, divergent from stage findings:**
When overall sentiment is positive but one or more stage-level failures have been documented, the positive overall rating is a commitment-bias artifact. Report the stage-level findings as primary and note that the overall positive sentiment likely reflects the customer's investment in the purchase decision rather than a genuine absence of dissatisfaction.

---

## Section 3: Quality Weighting Rules

**Sessions with commitment-bias signals:**
Identified by uniformly positive overall assessments combined with session reliability below 0.60, or by a pattern of normalizing language ("I suppose I wasn't expecting much," "it's just how it is"). Weight down positive stage-level assessments in proportion to the strength of the commitment-bias signal. Negative stage-level findings in these sessions should be treated as more reliable than positive ones — they required the respondent to overcome their protective instinct to report them.

**Sessions where the expectation baseline was established in the pre-purchase stage:**
These sessions can support full gap analysis. Stage-level findings in these sessions are categorically more analytically reliable than those from sessions where the expectation baseline was unavailable.

**Sessions where expectation source was identified:**
When the source of the pre-transaction expectation was documented — advertising, word of mouth, prior experience, website — the gap analysis can be characterized as a delivery failure or a promise failure, which is the most decision-relevant finding type. Weight the improvement implications for these sessions more heavily than for sessions where the source was unknown.

**Sessions with normalization language:**
When a respondent has explicitly normalized a recurring failure, this session's finding on that failure dimension should be treated as indicating a systemic operational problem, not a one-off event. A customer who says "it's always slow" is providing aggregate evidence of a persistent issue, not a single-transaction finding.

---

## Section 4: Benchmark Context

**Transaction type segmentation is required before any benchmark comparison.** An e-commerce delivery experience benchmark is not applicable to an in-store retail visit benchmark; a restaurant post-transaction benchmark is not applicable to a service repair benchmark. Always confirm the transaction type before selecting benchmarks.

**Expectation-gap benchmarks by expectation source:** Expectations set by advertising produce larger gaps on average than expectations set by word of mouth — advertising tends to present idealized versions of the experience, while word-of-mouth recommendations are typically calibrated. When using gap benchmarks, segment by expectation source if this data is available.

**Repeat purchase intent benchmarks:** These vary significantly by product category, transaction value, and market competition level. Single-session findings on repeat intent should be benchmarked against category norms, not cross-category averages.

**Communication satisfaction benchmarks:** Benchmarks for communication during fulfillment are highly sensitive to category expectation norms. Customers in categories with a strong same-day or next-day expectation (fast fashion, grocery, quick service restaurants) apply different communication standards than customers in high-consideration categories with naturally longer fulfillment windows (custom furniture, legal services, major appliances). Use the appropriate category benchmark.

**Benchmarks as context, not verdict:** A stage satisfaction finding at benchmark does not mean that stage is performing well — it means it is performing typically. In many transaction categories, typical performance includes significant improvement opportunities at specific stages. Always pair benchmark comparisons with the specific improvement data from the session.

---

## Section 5: Output Format Specification

**Section 1: Study Parameters**
Transaction type, recency window, journey scope studied (start and end points), population profile, expectation-setting sources documented in brief, any known operational context (recent changes to fulfillment, known service issues). Factual only.

**Section 2: Executive Summary**
Two to four sentences. Primary finding: which stage of the journey performed best and worst against expectation, and what the overall post-transaction sentiment was. If a delivery-versus-promise determination was made, state it here. Connect to the decision map's relevant outcome.

**Section 3: Pre-Purchase Expectation Baseline**
What the respondent expected from the transaction and where that expectation came from. This section sets the analytical frame for every subsequent section. If the baseline could not be established, flag this here and note the limitation on subsequent gap analysis.

**Section 4: Journey Stage Analysis**
Organized by stage — purchase experience, fulfillment accuracy, fulfillment communication, delivery moment, first use. For each stage: what happened, what was expected, and the gap characterization. Note whether positive stage findings represent genuine confirmation or thin coverage. Note whether negative findings are delivery failures or promise failures.

**Section 5: Primary Gap Finding**
The single most analytically significant expectation-reality gap in the session — the stage where the divergence was largest and most clearly attributable. Include the expectation, the experience, the gap, and the source of the expectation (if established). State the intervention implication directly: "This finding implies a [marketing / operations / communications / product] intervention at [specific stage]."

**Section 6: Improvement Data**
What the respondent described as the better version of the transaction. This is the most directly actionable section of the report — the respondent has described the target state. Present it specifically: "The respondent described the resolution as [specific description]" — not as a general recommendation.

**Section 7: Post-Transaction Sentiment and Repeat Intent**
Overall sentiment characterization, including any divergence from stage-level findings. Likelihood to transact again — with any conditions the respondent attached to it. Flag commitment-bias artifacts explicitly.

**Section 8: Decision Map Response**
Map each finding to its decision map entry. Address every entry, including those where the session produced inconclusive evidence.

**Section 9: Limitations and Confidence Notes**
Required. Use the specific language from Section 7.

**Attribution language:** Findings are always attributed to session evidence. "The session indicates that the fulfillment communication gap was the primary contributor to post-transaction sentiment decline" — not "the delivery communication failed." Single-session findings are indicative and cannot be generalized without corroboration.

---

## Section 6: Multi-Session Analysis Guide

**Consistent stage failure across sessions:**
When the same journey stage produces negative gap findings across three or more sessions, this is a systemic finding — not a series of individual transaction failures. Report the pattern as a structural journey problem: "Fulfillment communication was the consistent failure stage across [n] sessions, regardless of transaction type, indicating a systemic gap in the brand's mid-fulfillment communication protocol."

**Expectation source patterns:**
When multiple sessions share the same expectation source (e.g., all respondents describe photography-generated quality expectations that the product did not meet), the failure is in the marketing and communication layer, not in operations. This is a finding with a single intervention implication regardless of how many sessions document it.

**Stage satisfaction variance:**
Where one stage is consistently the strongest and another consistently the weakest across multiple sessions, the brand's journey design has identifiable peaks and failure points. Report the pattern with session counts: "In [n] of [n] sessions, the [purchase/booking] experience was the strongest stage; in [n] of [n] sessions, the [fulfillment communication] was the weakest."

**Segmentation by transaction frequency:**
First-time transactors and repeat customers apply different expectation baselines. Aggregate findings across these groups without segmentation will produce averages that accurately represent neither. Where the session population includes both, segment findings before pattern analysis.

---

## Section 7: Flagging and Limitation Language

**When the expectation baseline is unavailable:**
"The pre-purchase expectation baseline could not be established in this session. Stage-level experience descriptions are available but cannot be characterized as expectation gaps or confirmations without a comparison baseline. The primary finding type of Post-Transaction Research — expectation-versus-reality gap analysis — is unavailable for this session. Stage observations are reported as raw descriptions and should not be used for gap analysis without corroborating sessions that include an established baseline."

**When commitment bias is present:**
"The session reliability indicators suggest the respondent was operating under commitment bias — the tendency to frame a high-consideration purchase experience positively to protect the decision itself. Positive stage-level findings should be treated as a lower bound on satisfaction rather than as genuine confirmations. Negative findings documented in this session required the respondent to overcome this protective instinct and should be treated as more reliable than the positive findings."

**When normalization of recurring failure appears:**
"The respondent described [specific failure] as a habitual characteristic of their experience with [brand] — not as a single-transaction event. This finding indicates a persistent operational issue that has been absorbed into the respondent's expectations. The normalization of this failure is analytically more significant than the failure itself — it indicates that [brand] has trained this customer to expect less than the original proposition promised."

**When fulfillment accuracy failure is documented:**
"A fulfillment accuracy failure was documented in this session — the respondent received something materially different from what was ordered. This constitutes a fundamental transaction failure and is reported as the primary finding regardless of other stage performance. [If third-party context noted]: The respondent attributed this failure to [logistics partner / third-party fulfillment], which, if accurate, represents a partner management issue rather than a direct operational failure."

**When session count is insufficient for pattern claims:**
"Findings from [n] session(s) are transaction-specific and cannot support claims about the journey's systemic performance. The stage-level findings are reported as indicative observations. [Recommended n] sessions would be required before systemic journey conclusions could be drawn with confidence."