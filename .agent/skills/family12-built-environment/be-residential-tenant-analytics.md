---
name: Residential & Tenant Experience (Analytics)
description: Analysis of apartment living, amenities, and property management outcomes.
id: be-residential-tenant-analytics
version: 1.0.0
coverage_model_version: 1.0.0
---

# Section 1 — Data Interpretation Framework

## What this domain's data measures

Residential and tenant experience session data measures the subjective quality of a resident's experience of their dwelling, their management service, their amenities, and their residential community. It does not measure objective maintenance performance metrics, compliance standards, or market value. It measures the experiential gap between what the property was marketed as and what it delivers as a daily lived environment.

The most important interpretive principle is the distinction between functional adequacy and experiential quality. A management team that resolves 90% of maintenance requests within the agreed SLA can still produce residents who feel ignored, unvalued, and disconnected — if the human quality of the service interactions is poor. Similarly, a property can be physically well-maintained and acoustically uncomfortable, or physically adequate but socially isolating. The Analytics agent must separate these dimensions before synthesizing them.

## The disengagement signal

The most important analytical signal in this domain is disengagement from the management relationship — residents who describe having stopped reporting issues, stopped using shared amenities, or stopped expecting management responses. This signal is more analytically significant than any specific incident description because it represents an accumulation of failures that has crossed the threshold of active grievance into passive withdrawal. When this signal is present, report it prominently regardless of what other findings indicate.

## Common misreadings

**Misreading 1: Treating resolved maintenance requests as evidence of good management experience.** Resolution is necessary but insufficient. The quality of the service interaction — the communication during the process, the empathy of the response, the resident's sense of being kept in the loop — is what determines whether the experience produces satisfaction or residual resentment. Report the experiential quality separately from the resolution outcome.

**Misreading 2: Treating low amenity utilization as evidence of satisfaction with amenity provision.** Residents stop using amenities for three different reasons: they tried them and found them inadequate, they never had a lifestyle need for them, or they had a negative experience that deterred return. These three explanations have completely different implications. The Analytics agent must identify which applies before reporting any amenity finding.

**Misreading 3: Treating positive home-feeling language as a management endorsement.** A resident who says "I feel very at home here" is describing their relationship with their dwelling space, not necessarily their relationship with the management service. Home feeling and management satisfaction are distinct constructs that must be reported separately.

**Misreading 4: Interpreting "I don't bother reporting things anymore" as low-need.** This statement is a significant management failure signal. It indicates systematic expectation destruction — the resident has learned that the management service will not meet their needs and has adapted by withdrawing. Report it prominently.

---

# Section 2 — Coverage Interpretation Guide

## NODE-RT-01: Arrival and first impression

**Move-in experience below threshold:** First impressions in residential contexts set the emotional baseline for the entire tenancy. A poor move-in experience — delayed key handover, incomplete cleaning, maintenance issues on day one, absent management welcome — creates a deficit that good subsequent service must work against. Even where subsequent service is adequate, a poor move-in experience shapes the lens through which all subsequent interactions are filtered.

**High positive first impression with subsequent negative accounts:** Report the gap explicitly. "The resident's initial arrival experience was strongly positive — [specific account]. The subsequent management experience has eroded that initial confidence, producing a residue of disappointment disproportionate to the individual issues because it contradicts the expectation the move-in experience set."

## NODE-RT-02: Physical dwelling quality

**NODE-RT-02a (noise) negative findings:** Noise complaints in residential research must always be reported with the specific impact on daily life and the behavioral modifications they have produced — when the resident goes to bed, where they work from home, which rooms they avoid at certain times. The behavioral modification is the measure of impact, not the decibel level.

**Physical quality positive findings:** Report physical quality strengths alongside management findings when they diverge — a resident who finds the apartment comfortable and well-designed but experiences poor management service has a specific profile (physical adequacy, service deficit) that drives specific intervention recommendations.

## NODE-RT-03: Property management and maintenance

**This is the highest-weight node in the domain for decision-making purposes.** Management experience is the primary driver of renewal decisions and referrals. Report it with the full specificity the transcript contains.

**NODE-RT-03a (maintenance responsiveness):** Report the complete journey the resident described — initial contact, acknowledgment, timeline, updates, outcome, and aftermath. The aftermath is as analytically important as the outcome: "The leak was fixed on the third visit. But the resident's description of the six weeks between first report and resolution — the absence of updates, the requirement to re-submit the request twice, the feeling of not knowing whether anyone was working on it — produced a lasting sense that the management team does not treat resident problems with appropriate urgency."

**Disengagement signal:** When a resident describes having stopped reporting issues or stopped expecting management responses, this finding must appear in the executive summary regardless of what other findings indicate. It is the leading indicator of non-renewal and referral failure.

## NODE-RT-04: Shared amenities and common areas

**Under-utilization findings:** Always report the attributed reason for under-utilization. "The resident does not use the co-working space" is not a finding. "The resident tried the co-working space twice in their first month but did not return because [specific attributed reason — noise level, booking friction, social discomfort] is a finding with an implication.

**Condition and reliability findings:** Report in terms of their impact on value perception. An amenity that is physically present but frequently out of service or poorly maintained undermines the resident's sense that the premium they are paying is justified.

## NODE-RT-05: Residential community

**Social isolation in residential buildings:** Distinguish between residents who have chosen social distance and residents who would prefer more community but have not found the conditions for it. The first group has no unmet need. The second group represents an opportunity for management-facilitated community building — and a missed element of the product's value proposition.

## NODE-RT-06: Value perception and renewal intention

**Conditional renewal statements:** "I'll probably stay unless something better comes along" and "I'd consider moving if the rent goes up much" are not satisfactory renewal confirmations. Both indicate contingent retention — the resident is held by inertia and cost, not by satisfaction. Report these as retention-risk signals, not as positive renewal intent.

**Explicit renewal risk factors named by the resident:** These are the most directly actionable findings in the domain. If the resident has named a specific condition under which they would not renew — a specific price threshold, a specific service improvement required, a specific physical issue needing resolution — this condition must appear in the recommendations section connected directly to the decision map.

---

# Section 3 — Quality Weighting Rules

## Sessions with management relationship anxiety

Apply across the entire session: weight all positive management assessments at 0.5 of face value. Weight specific maintenance incident accounts at 1.0. Weight normalization probe confirmations at 0.85. Report: "This session showed management relationship anxiety patterns — positive generic assessments of the management service that were not fully consistent with specific incident accounts. Specific experiential accounts of maintenance and management interactions have been weighted as primary evidence."

## Turns flagged for social desirability (sunk-cost positivity)

Report: "The resident's overall assessment of the living experience was positive. This assessment should be read in the context of [tenure length] of residence and significant personal investment in the dwelling. Specific accounts — particularly [identified nodes] — provide a more granular picture of where the experience departs from this positive overall framing."

## Maintenance resolution versus experience distinction

When a maintenance request was described as ultimately resolved but the interaction quality was poor, report both: "The maintenance issue was resolved. However, the resident's description of the resolution process — [specific account] — indicates that the experiential quality of the service, independent of the outcome, produced a net negative impact on their sense of being looked after by the management team."

## The disengagement signal weighting

When a resident has described stopping their reporting behavior, this observation overrides all positive management signals in the same session. Report it at full weight regardless of session reliability score. Disengagement behavior is more analytically reliable than any stated assessment because it is behavioral rather than verbal.

---

# Section 4 — Benchmark Context Guide

## Valid comparisons

Benchmarks are valid when matched on: property type (purpose-built rental, converted rental, social housing, co-living), property age (new-build versus established), management model (in-house versus external), and location density.

## Management responsiveness benchmarks

Must be segmented by management model before citation. In-house management and external agency management show systematically different performance profiles. Mixing these in a single benchmark comparison is invalid.

## When not to cite benchmarks

Do not cite management satisfaction benchmarks when the session has shown disengagement patterns — the resident who has stopped reporting has opted out of the service relationship entirely, making their experience non-comparable to a general resident satisfaction population.

---

# Section 5 — Output Format Specification

## Executive summary

Must contain: the primary finding about resident experience of the property, with specific reference to the disengagement signal if present. Data reliability assessment. Coverage completeness.

Example: "The central finding is management service disengagement — the resident describes having stopped submitting maintenance requests after a sustained period of inadequate response, and now manages minor issues independently rather than contacting the management team. This represents a systematic breakdown in the service relationship that poses direct renewal and referral risk. Data reliability was good; management relationship anxiety was present but limited."

## Findings sections

Four sections: Dwelling Quality, Management and Maintenance Experience, Amenities and Common Areas, Community and Value. NODE-RT-01 findings are woven into the Dwelling Quality and Management sections as the expectation baseline against which current experience is assessed.

Physical and service findings must be reported separately — never merged into a single "property quality" finding. The intervention implications for physical failures and service failures are different.

Management experience must include the complete journey narrative where available — not only the outcome.

## Recommendations section

One recommendation per decision map scenario. Each must be traceable to a specific finding and a bounded action. The disengagement signal, if present, always generates a specific recommendation: "Proactive outreach to identify and engage residents who have stopped submitting maintenance requests, with a dedicated resolution process that does not require the resident to initiate further contact."

---

# Section 6 — Multi-Session Analysis Guide

## Tenure segmentation requirement

Segment by tenure length: under-one-year residents (calibration phase), one-to-three-year residents (settled experience phase), and over-three-year residents (long-term relationship phase). These segments produce different management experience profiles — particularly on tolerance for maintenance delays — and must not be aggregated without noting the segment distribution.

## Disengagement pattern as aggregate signal

If more than one session shows the disengagement signal (residents who have stopped reporting), this is one of the most significant aggregate findings possible. Report it prominently: "Multiple sessions showed evidence of management disengagement — residents who have stopped using the formal maintenance reporting process. This pattern, present in [N] of [total] sessions, suggests a systemic service relationship failure rather than isolated incidents."

## Amenity utilization across sessions

When amenity under-utilization appears across multiple sessions with different attributed reasons, report the distribution of reasons separately — lifestyle mismatch (amenity was never relevant to this resident's needs) versus experience-based disengagement (tried it, didn't return, with a stated reason) versus awareness gap (resident was unaware of the amenity or its booking process). These require different responses.

---

# Section 7 — Flagging and Limitation Language

## Disengagement signal present

"This session showed evidence of management relationship disengagement — the resident describes having [stopped reporting maintenance / stopped using the formal process / reduced contact with the management team]. This signal is analytically significant independent of session reliability score. The resident's description of what prompted this disengagement — [specific account] — represents the most important actionable finding in this session."

## Management relationship anxiety present

"Positive management assessments in this session have been treated conservatively, as the session showed management relationship anxiety patterns. The resident may have a working relationship with the management team that moderates their disclosure in a research context even when explicit confidentiality assurances have been given. Specific incident accounts have been weighted above summary assessments throughout."

## Active unresolved dispute

"The resident is currently involved in an unresolved dispute with management regarding [general issue type, no specific incident details]. This active dispute significantly shapes their responses on management-related nodes. Their accounts of this specific dispute have been noted but should not be treated as representative of the general management experience without corroborating sessions. Their responses on other nodes — physical quality, amenities, community — are unaffected by this limitation."

## Rent review awareness limitation

"The brief notes an imminent rent review. The resident was likely aware of this context during the session. Value perception and renewal intention findings may be shaped by anticipated rent increases rather than reflecting steady-state sentiment. Findings from these nodes should be treated as conditional on the rent review outcome."