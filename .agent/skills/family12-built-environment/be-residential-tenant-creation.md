---
name: Residential & Tenant Experience (Creation)
description: Briefing and methodology for apartment living, amenities, and property management research.
id: be-residential-tenant-creation
version: 1.0.0
coverage_model_version: 1.0.0
---

# Section 1 — Domain Identity

Residential and Tenant Experience research is the systematic investigation of what it is like to live in a specific residential property or managed housing development — the quality of the physical dwelling, the management and maintenance service, the shared amenities, the sense of community within the building or complex, and the overall feeling of whether this property constitutes a home rather than merely a shelter. It is concerned with the experiential gap between what a property was marketed as and what it actually delivers as a daily lived environment.

This domain is distinct from Community and Neighborhood Research because it is focused on the internal experience of a specific building, complex, or managed estate rather than the wider residential area. A resident may love their apartment and hate their neighborhood, or feel safe and welcome in their wider area while experiencing poor management, social isolation, or physical discomfort within their specific property. Both experiences matter; they must be studied separately and reported separately.

The domain covers four distinct dimensions. The physical dwelling quality — the condition, comfort, noise insulation, light, temperature regulation, and material durability of the specific unit. The property management and maintenance service — the responsiveness, competence, empathy, and reliability of the organization or individuals responsible for maintaining the property and responding to resident needs. The shared amenities and common areas — the quality, accessibility, and social function of the facilities that extend the resident's living environment beyond their own unit. The residential community — the quality of relationships between residents, the sense of belonging to a building community, and whether the environment supports or suppresses social connection.

This domain is not appropriate for studying the wider neighborhood — that belongs to Community and Neighborhood Research. It is not appropriate for evaluating specific planning or development decisions in the abstract — that belongs to Policy and Community Consultation research.

---

# Section 2 — Research Questions This Domain Can and Cannot Answer

## Questions this domain is equipped to answer

- What is the resident's experience of the physical quality of their dwelling — comfort, noise, light, temperature, and material condition?
- How does the property management service perform when residents need it — in terms of speed, competence, empathy, and follow-through?
- What is the experience of the shared amenities — are they used, do they work, do they contribute to the resident's quality of life, and what is missing?
- Does the building or complex support any sense of community among residents, or does it function as a collection of isolated private spaces?
- What is the resident's overall sense of value — does the total living experience justify the cost of living here?
- What specific moments or interactions have most shaped the resident's sense of whether this property constitutes a home?
- What is the resident's likelihood of renewing and what factors most influence that decision?

## Questions this domain cannot answer

- What the wider neighborhood experience is like — redirect to Community and Neighborhood Research
- Whether this property's management performance meets regulatory standards — that is a compliance assessment, not a research question
- Whether the property is priced appropriately relative to the market — redirect to Pricing and Value Perception research
- Whether a specific staff member should be disciplined or terminated — research data is not an accountability instrument

---

# Section 3 — Brief Interrogation Guide

## 3.1 Property type and management structure

**Information required:** The type of property being studied (high-rise apartment block, low-rise complex, managed estate, purpose-built student accommodation, co-living, etc.), who manages it (in-house team, external management company, owner-managed), and whether residents have any formal participation in management (residents' association, leaseholder committee).

**Complete answer:** "It's a 200-unit purpose-built rental development, built six years ago, managed by an in-house team of four. We have a residents' association that meets quarterly. Residents are predominantly professionals in their 30s, mix of one and two-bedroom units."

**Incomplete answer:** "It's a residential development." The management structure and resident participation mechanism both affect the social dynamics of the research.

**Required or optional:** Required.

## 3.2 Tenure type and resident profile

**Information required:** Whether residents own (leasehold or freehold), rent privately, or live in social housing, combined with typical tenure length, demographics, and lifestyle profile.

**Complete answer:** "All private renters. Average tenure about eighteen months, range from three months to four years. Predominantly single professionals and couples, no children. About 30% international residents on two-year work contracts."

**Follow-up probe:** "Is there a meaningful difference between longer-term residents and those who have just moved in — do they seem to want different things from the property?"

**Required or optional:** Required.

## 3.3 Known management and maintenance issues

**Information required:** What complaint patterns the client is aware of, what triggered this research, and what the client already knows or suspects is not working.

**Complete answer:** "We've had a 40% increase in maintenance ticket volume in the past year, but our resident satisfaction scores on the annual survey are still good. We think there's a gap between how our management team perceives their performance and how residents experience it, but we can't identify where the gap is."

**Follow-up probe:** "What are residents telling you in maintenance requests, complaint emails, or direct contact that you want this research to either confirm or explain? And what finding would change how you operate?"

**Required or optional:** Required.

## 3.4 Amenity profile and utilization concerns

**Information required:** Which amenities the property offers, what the management's sense of utilization patterns is, and whether any amenities are known to underperform or over-promise.

**Complete answer:** "We have a gym, a rooftop terrace, a co-working space, a residents' lounge, a parcel room, and a cycle store. The gym is heavily used. The co-working space and residents' lounge appear underutilized based on booking data. The rooftop was popular in summer but we don't have data for the rest of the year."

**Required or optional:** Advisory. Amenity profile enriches the coverage model weighting.

## 3.5 Renewal decision context

**Information required:** Whether there is an upcoming renewal cycle, a pricing change, or a management decision tied to the research findings.

**Complete answer:** "We are ahead of our annual rent review. We are also considering whether to invest in upgrading the co-working space or redirecting that budget to maintenance response time improvement. These findings will inform that decision."

**Required or optional:** Required. Defines the actionable decision stakes that give the decision map its precision.

---

# Section 4 — Decision Map Interrogation

## Interrogation framework

**For positive findings:**
"If the research shows residents feel genuinely at home — the management is responsive, the space is comfortable, the community functions — what specifically changes? Is there a rent review decision, a marketing claim, or an investment prioritization that this would support?"

**For negative findings:**
"If the research identifies a specific management failure or physical shortcoming that is driving dissatisfaction — what is the immediate action? Is there a specific team, process, or physical feature you could change within the next three months?"

**For mixed findings:**
"If physical quality is good but management experience is poor — or vice versa — what does that mean for your priorities? And if amenity utilization is low, does that change the investment case?"

## Complete decision map example

Positive: "If resident satisfaction with management responsiveness is strong, we will use the findings to justify the current staffing model at the annual budget review."

Negative: "If residents describe specific points in the maintenance request process where they feel ignored or unresolved, we will redesign that specific touchpoint before the next quarterly residents' association meeting."

Mixed: "If physical quality is high but community experience is low, we will redirect the co-working space upgrade budget to a program of resident events designed to activate the residents' lounge."

---

# Section 5 — Coverage Model Specification

**Coverage model version: 1.0.0** — must match the Conducting skill file version.

**NODE-RT-01: Arrival and first impression**
Weight: High | Critical: Yes | Parent: Root | Children: NODE-RT-01a, NODE-RT-01b
Threshold: 0.70 | Min turns: 2

**NODE-RT-01a: Move-in process and onboarding experience**
Weight: High | Critical: No | Parent: NODE-RT-01
Threshold: 0.65 | Min turns: 1

**NODE-RT-01b: First impression of the dwelling and building as a potential home**
Weight: High | Critical: Yes | Parent: NODE-RT-01
Threshold: 0.70 | Min turns: 2

**NODE-RT-02: Physical dwelling quality**
Weight: Critical | Critical: Yes | Parent: Root | Children: NODE-RT-02a, NODE-RT-02b, NODE-RT-02c
Threshold: 0.70 | Min turns: 2

**NODE-RT-02a: Noise isolation and acoustic comfort**
Weight: High | Critical: Yes | Parent: NODE-RT-02
Threshold: 0.70 | Min turns: 2

**NODE-RT-02b: Light, temperature, and climate comfort**
Weight: High | Critical: No | Parent: NODE-RT-02
Threshold: 0.65 | Min turns: 1

**NODE-RT-02c: Material quality and durability**
Weight: Medium | Critical: No | Parent: NODE-RT-02
Threshold: 0.60 | Min turns: 1

**NODE-RT-03: Property management and maintenance**
Weight: Critical | Critical: Yes | Parent: Root | Children: NODE-RT-03a, NODE-RT-03b
Threshold: 0.75 | Min turns: 2

**NODE-RT-03a: Responsiveness and process quality of maintenance requests**
Weight: High | Critical: Yes | Parent: NODE-RT-03
Threshold: 0.75 | Min turns: 2

**NODE-RT-03b: Quality of proactive management communication**
Weight: High | Critical: No | Parent: NODE-RT-03
Threshold: 0.65 | Min turns: 1

**NODE-RT-04: Shared amenities and common areas**
Weight: High | Critical: No | Parent: Root | Children: NODE-RT-04a, NODE-RT-04b
Threshold: 0.65 | Min turns: 1

**NODE-RT-04a: Utilization and practical value of amenities**
Weight: High | Critical: No | Parent: NODE-RT-04
Threshold: 0.65 | Min turns: 1

**NODE-RT-04b: Condition and reliability of shared spaces**
Weight: Medium | Critical: No | Parent: NODE-RT-04
Threshold: 0.60 | Min turns: 1

**NODE-RT-05: Residential community and social quality**
Weight: High | Critical: No | Parent: Root | Children: NODE-RT-05a
Threshold: 0.65 | Min turns: 1

**NODE-RT-05a: Sense of belonging within the building or complex**
Weight: High | Critical: No | Parent: NODE-RT-05
Threshold: 0.65 | Min turns: 1

**NODE-RT-06: Value perception and renewal intention**
Weight: High | Critical: No | Parent: Root
Threshold: 0.65 | Min turns: 1

---

# Section 6 — Audience Model Interrogation Guide

## Psychographic dimensions to capture

**Tenure length and transition context:** Short-term residents (under one year) are primarily in the comparison and calibration phase — they are still determining whether this property meets their needs. Medium-term residents (one to three years) have formed settled opinions and have experienced the management service multiple times. Long-term residents (three or more years) have deep experience of the property's rhythms and failures and have typically made peace with certain compromises.

**Home identity investment:** Whether the resident treats this as a temporary accommodation or a genuine home. Residents who identify strongly with their home invest emotionally in its quality and experience management failures as personal affronts. Residents who treat it as temporary are more tolerant of physical shortcomings and management failures.

**Lifestyle alignment:** Whether the property's design and amenity profile matches the resident's actual lifestyle. A resident who wanted a quiet, professional environment in a building that runs community events may be permanently misaligned regardless of service quality.

## Questions to surface these dimensions

"How long have you been living here, and when you moved in, were you planning to stay long-term or was it more of a temporary arrangement?"

"Would you describe this as home, or more as somewhere you're living for now?"

"When you chose this place, what were the most important things you were looking for — and has it delivered on those?"

## Known sensitivity flags

Residents in dispute with management over unresolved maintenance issues carry active grievances that will shape every response. The agent must surface this early and handle it carefully — the grievance is research data but cannot be allowed to dominate the session.

Residents who have paid a significant rental premium based on amenity promises that have not been delivered carry a financial grievance dimension that may produce strongly negative responses on value perception and amenity nodes.

---

# Section 7 — Constitutional Constraints

## Blocking constraints

**Constraint B-1: The decision map must include at least one specific physical or process change the client can make.** A brief that produces only recommendations to "improve satisfaction" is not actionable. At least one scenario must have a specific, bounded action attached to it.

**Constraint B-2: If the research will be used in management performance assessment, this must be recorded in expertState.** Research data must not be used as a direct performance management instrument for named individuals. If this use is intended, the agent must note it in the expertState and the Analytics skill file's limitation language applies with increased stringency.

## Advisory constraints

**Advisory A-1: If a rent review is imminent, record in expertState.** Residents who are aware of an upcoming rent review may frame all responses through the lens of the anticipated increase. This creates a specific audience psychology pattern that must be noted.

**Advisory A-2: If there are active unresolved maintenance disputes, record known dispute categories.** The Conducting agent must be able to anticipate and manage sessions where active grievances are present.

---

# Section 8 — Duration Calibration Guide

| Research focus | Minimum duration | Notes |
|---|---|---|
| Management and maintenance only | 14 minutes | Narrow brief; four active nodes maximum |
| Physical quality and amenities | 16 minutes | Physical focus; community nodes optional |
| Full resident experience | 20–25 minutes | All critical nodes active |

NODE-RT-03 (management and maintenance) is consistently the richest and longest node in this domain — residents with maintenance experience have detailed stories and need time to tell them. Budget a minimum of six minutes for this node in any session where management quality is a research priority.

---

# Section 9 — Handoff Checklist

- `brief.objectives` — at least one names a specific property dimension (management, physical quality, amenities, community) or a specific decision (renewal pricing, investment allocation, process redesign).
- `brief.decisionMap.ifPositive` — specific action within client power.
- `brief.decisionMap.ifNegative` — specific bounded action achievable within three months.
- `brief.decisionMap.ifMixed` — prioritization criterion between competing investment options.
- `brief.sensitiveTopics` — must include "active maintenance disputes" if known, "rent review awareness" if applicable.
- `audienceModel.psychographicProfile` — captures tenure length and home identity investment level.
- `audienceModel.knownBiases` — includes "sunk-cost home investment" for long-term residents and "financial grievance" for residents with unresolved premium-amenity promises.
- `coverageTracker.nodes` — initialized with all nodes from Coverage Model version 1.0.0 at confidence 0.0.
- `sessionMeta.coverageModelVersion` — set to "1.0.0".
- `sessionMeta.status` — set to `brief_complete` only after all above pass.