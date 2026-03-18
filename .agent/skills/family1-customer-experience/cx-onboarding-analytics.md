---
name: Onboarding Experience Research (Analytics)
description: Analytics agent skill for interpreting Onboarding Experience Research sessions. Covers activation moment analysis, technical versus conceptual barrier interpretation, quality handling, benchmark contextualization, output format, and limitation language for time-to-value and adoption barrier research.
id: cx-onboarding-analytics
version: 1.0.0
---

## Section 1: What This Domain's Data Actually Means

Onboarding Experience Research data is about the formation of a product relationship — the period during which a new customer moves from "learning this" to "using this." The Analytics agent's central interpretive task is threefold: Was the activation moment reached? When? And what produced it? These three questions structure the entire analytical output.

**The activation moment is not the same as satisfaction:** A customer can complete onboarding with high satisfaction and never reach a genuine activation moment — they may have had a smooth setup experience with a product they don't use. Conversely, a customer can have a difficult onboarding and reach activation strongly — the moment of breakthrough is more valuable than the smoothness of the path. Analytics must not conflate onboarding satisfaction with activation.

**The technical/conceptual barrier distinction is the most actionable finding in the domain:** When the Conducting agent characterized every friction point as either technical (interface, setup mechanics, configuration steps) or conceptual (understanding of purpose, relevance, or value of a feature or step), this characterization is the direct input for the client's intervention decision. A report that identifies friction without characterizing the barrier type is a report that implies the wrong fix. The Analytics agent must preserve and report the barrier type for every identified friction point.

**What non-activation means:** When the Conducting session flagged that no activation moment occurred — that the customer has not yet experienced the product as genuinely solving a problem — this is the session's primary finding, regardless of what other nodes produced. A customer who completed setup, found the interface acceptable, and used the product occasionally but has not reached activation has not received the onboarding's value. Report non-activation as a primary finding, not as a coverage gap.

**What the what-produced-it finding means:** When the activation moment has been identified and the specific cause has been established — a specific feature, a specific task context, a specific realization — this is the most actionable data point the domain produces. It is a direct input for onboarding design: if this feature or experience produces activation, new customers should be directed toward it earlier and more deliberately in the onboarding sequence.

**What support dependency means:** High support dependency during onboarding is not simply a cost problem — it is a signal about which parts of the onboarding process are not self-explanatory. Where support clusters, the product's self-service explanation is insufficient. Analytics must identify the specific support trigger topics and characterize them as technical or conceptual failures in the self-service guidance.

---

## Section 2: Coverage Interpretation Guide

**Activation Moment — Not Reached:**
Primary finding. "The customer has not reached an activation moment — the product has not yet been experienced as genuinely solving a problem. The onboarding process has not produced adoption, regardless of whether setup was completed. The barrier to activation was characterized as [technical / conceptual / motivational] based on the session evidence."

**Activation Moment — Reached Late (beyond two weeks):**
A late activation moment is an important finding even when activation eventually occurred. The delay represents a period of at-risk usage during which the customer could have churned. Identify what produced the delay: was it a friction point that could have been removed? A conceptual gap that could have been addressed earlier? A feature that wasn't introduced until later in the onboarding?

**Activation Moment — Reached Early (within first session or first week):**
Positive finding. Note what specifically produced early activation. Early activators are the reference case for onboarding design — understanding what enabled early activation in some customers is the guide for redesigning the onboarding to replicate that experience for others.

**Conceptual Barriers — High proportion:**
When the session documents a higher proportion of conceptual barriers than technical barriers, the onboarding problem is primarily an education and communication problem rather than a UX problem. The intervention is content redesign, not interface redesign.

**Technical Barriers — High proportion:**
When technical barriers predominate, the intervention is UX and product design. But a technical barrier finding without a specific step identification is insufficient — the Analytics agent must ensure the specific friction steps are named and reported.

**Support Journey — High dependency:**
"High support dependency during onboarding indicates that the self-service onboarding process does not provide sufficient guidance for customers at [identified steps]. The support triggers cluster around [topics] — characterizing these as [technical / conceptual] failures in the self-service guidance. The intervention is [specific content addition / UX change] at [identified steps]."

**Post-Onboarding Confidence — Low despite completed setup:**
When the customer completed setup and potentially reached a technical activation event but reports low confidence, this suggests the activation was procedural rather than genuine — they went through the steps but don't feel capable of using the product independently. Low confidence post-setup often indicates that conceptual clarity was never reached even though the technical setup was completed.

---

## Section 3: Quality Weighting Rules

**Sessions with honeymoon-phase enthusiasm:**
Identified by uniformly positive assessments with no friction evidence across a non-trivial product's setup. These sessions are likely under-reporting friction. Weight down positive friction-free assessments; investigate whether the respondent is in an early enthusiasm phase that is moderating their honest account. The improvement probe answer is the most reliable data from these sessions — even enthusiastic respondents will describe what could be better.

**Sessions with capability-shame signals:**
When the Conducting agent flagged capability-shame behavior — the respondent attributing difficulty to personal limitation — treat all friction points described in these sessions as genuine product gaps regardless of the respondent's framing. The capability shame does not invalidate the friction; it obscures its product-attribution. Report the friction as product findings, not as individual performance notes.

**Sessions where barrier type characterization was incomplete:**
If the Conducting agent was unable to characterize some friction points as technical or conceptual, note the gap explicitly in the Analytics output. Uncharacterized friction points can be included as general friction findings but cannot be used for intervention type recommendations.

**Sessions with organizational adoption barriers:**
In enterprise or team software contexts, when the Conducting agent flagged organizational barriers — the respondent needed colleagues to adopt, needed internal approval, needed to integrate with existing systems — these are a distinct category from product barriers. Report them separately: "Activation was delayed by organizational adoption requirements [specific description] rather than product-level barriers."

---

## Section 4: Benchmark Context

**Time-to-activation benchmarks by product category:** These vary dramatically. A consumer mobile app should reach activation within the first session for most users; an enterprise software product may have an industry-standard activation period of three to six weeks. Always use category-appropriate benchmarks.

**Self-service completion rate benchmarks:** The proportion of customers who complete onboarding without human support varies by product complexity and category. Benchmark the support dependency finding against category norms before characterizing it as above or below average.

**Support ticket cluster benchmarks:** Where the client has provided internal support ticket cluster data, cross-reference it against the session's support trigger findings. Convergence between session evidence and support data strengthens the finding. Divergence may indicate that support data captures a different population than the research.

**What benchmarks cannot tell the client:** A time-to-activation at benchmark does not mean the onboarding is well-designed — it means it is typical. In many product categories, the industry benchmark reflects a widespread design problem rather than an achieved ideal. When using activation timing benchmarks, pair them with the what-produced-it finding to identify whether the current timing is the result of an avoidable barrier or a genuine product learning curve.

---

## Section 5: Output Format Specification

**Section 1: Study Parameters**
Product type, onboarding model (self-service / guided / blended), support resources available, participant recency, client's activation moment definition, any recent onboarding process changes. Factual only.

**Section 2: Executive Summary**
Two to four sentences. Activation status (reached / not reached), when, and what produced it. Primary barrier finding (technical or conceptual, if barriers were identified). Connection to the decision map's relevant outcome.

**Section 3: First Impression and Setup Journey**
First impression characterization. Setup journey narrative with specific friction points identified. Each friction point must be characterized as technical or conceptual. Note the specific steps where friction occurred.

**Section 4: Activation Analysis**
This is the primary section. Activation status: reached or not reached. If reached: when, what the customer was doing, and what specifically produced the click. If not reached: what is preventing activation, and what the barrier is. The what-produced-it finding is reported with specific detail — this is the most actionable finding in the domain.

**Section 5: Barrier Summary**
A consolidated summary of all identified barriers, each characterized as technical or conceptual, and each with an intervention implication. This section is the direct input for the client's product, UX, or content team.

**Section 6: Support Journey Analysis**
Support need and quality assessment. Self-service vs. human support dependency. Support trigger topics — what the customer needed help with — characterized as technical or conceptual failures in the self-service guidance.

**Section 7: Post-Onboarding Confidence and Improvement Data**
Current confidence level. Characterize as genuine (based on specific capability evidence) or procedural (based on setup completion without clear capability). Improvement data: the respondent's specific description of what would have made the onboarding better — reported as a specific design or content observation.

**Section 8: Decision Map Response**
Map each finding to its decision map entry. Address every entry.

**Section 9: Limitations and Confidence Notes**
Required. Use the specific language from Section 7.

**Attribution language:** All findings attributed to session evidence. "The session indicates that the activation moment was produced by [specific feature] when the respondent [specific context]" — not "the product activates customers through [feature]."

---

## Section 6: Multi-Session Analysis Guide

**Activation rate and timing patterns:**
Across multiple sessions, the proportion of customers who reached activation, and the distribution of time-to-activation, are the primary aggregate metrics. These should be reported as: activation rate (proportion who reached activation in the session), and median / range of time elapsed.

**Barrier type distribution:**
Count the proportion of identified friction points that are technical vs. conceptual across multiple sessions. A predominantly conceptual barrier distribution indicates a content and education investment priority. A predominantly technical barrier distribution indicates a UX/product investment priority. This distribution finding is often the most strategically significant aggregate finding in the research.

**Activation trigger convergence:**
When multiple sessions identify the same specific feature or experience as producing the activation moment, this is a strong design signal: this feature is the product's activation mechanism. Onboarding design should guide new customers toward this feature earlier and more deliberately.

**Support trigger convergence:**
When multiple sessions document support needs clustering around the same steps, these steps are the primary candidates for self-service guidance improvement. Report the convergent support triggers as a ranked list of design priorities.

---

## Section 7: Flagging and Limitation Language

**When no activation moment occurred:**
"The primary finding of this session is that activation has not occurred — the respondent has not experienced [product] as genuinely solving a problem in a specific moment. The onboarding process has not produced adoption. The barrier to activation was characterized as [technical / conceptual / organizational / motivational] based on the session evidence: [specific description]. The intervention implication is [specific recommendation based on barrier type]."

**When barrier type characterization is incomplete:**
"[Number] friction points were identified in this session but could not be fully characterized as technical or conceptual barriers. Uncharacterized friction points are reported as general friction findings and cannot be used to determine intervention type without further probing. The general friction locations were [specific steps]."

**When honeymoon-phase enthusiasm is present:**
"The session reliability indicators suggest the respondent may be in a positive early-adoption phase that is moderating their friction reporting. The absence of specific friction evidence in this session may reflect genuine smoothness or may reflect the honeymoon effect. The improvement data from the session — which was [improvement probe answer] — is treated as more reliable than the uniformly positive journey account and should be used as the primary evidence base."

**When organizational barriers were the primary activation impediment:**
"The primary barriers to activation in this session were organizational rather than product-level: [description of organizational barriers — colleague adoption requirement, internal approval, system integration]. These barriers are outside the product's direct control but may be addressable through onboarding design elements that account for the organizational adoption context — for example, [specific design suggestion based on the barrier]."

**When onboarding recency is outside the twelve-week window:**
"This session was conducted [time period] after the respondent's onboarding, which is outside the twelve-week window for detailed friction recall. Specific setup journey friction findings from this session are of limited reliability and should be treated as impressionistic rather than granular. The activation status, time-to-activation, and post-onboarding confidence findings remain reliable. Detailed barrier characterization should be sought from more recent sessions."