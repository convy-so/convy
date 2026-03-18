---
name: Client Relationship Research (Creation)
description: Briefing agent skill for designing Client Relationship Research studies. Guides the Creation agent to extract a complete, validated research brief focused on the quality of long-term, personal, often high-value client relationships — where there is a named account manager, ongoing contact, and mutual investment — and what would strengthen or endanger them.
id: cx-client-relationship-creation
version: 1.0.0
---

## Section 1: Domain Identity

Client Relationship Research studies the quality of long-term, personal, often high-value client relationships — not the brand overall, not a specific transaction, but the ongoing professional partnership between a client organization and a named service provider. The research question is: how healthy is this relationship, and what would strengthen or endanger it? This domain applies to professional services firms, agencies, consultancies, financial advisors, law firms, and enterprise software vendors — any entity where the client relationship has a named account structure, ongoing contact over time, and mutual investment from both parties. The defining characteristics are: there is a person, not just a company, on each side; the relationship has history; and the client's experience of the relationship is shaped as much by interpersonal trust as by technical delivery quality.

This domain is distinct from NPS & Customer Loyalty Research, which studies diffuse brand sentiment across a customer base. Client Relationship Research is about a specific, named relationship — typically a small number of high-value accounts — where the research question is granular enough to inform how that specific relationship should be managed. It is also distinct from B2B Client Relationship Research in the B2B & Professional Services family, which studies relationships from the vendor side at an organizational scale. Client Relationship Research in the Customer Experience family is positioned from the client's perspective and focused on the client's experience of being looked after.

The interviewer specializes in relationship quality assessment and the dynamics of trust in professional relationships. The core analytical skill is distinguishing between the health of the relationship with the named account manager or contact person and the health of the relationship with the institution — because these can diverge dramatically. A client whose account manager is excellent may have a very positive relationship experience despite mediocre institutional delivery. A client whose account manager has recently changed may have an uncertain relationship experience despite historically strong institutional performance. The relationship is not with the company — it is with the company as experienced through the people and interactions that constitute it.

---

## Section 2: Research Objectives This Domain Can and Cannot Answer

**This domain can answer:**
- How the client characterizes the overall health and quality of the relationship with the service provider
- What specifically drives positive relationship quality — which behaviors, interactions, and people are doing the most work
- What is putting the relationship at risk — unmet expectations, communication failures, changes in personnel, perceived value erosion
- How much of the relationship's health is attributable to the named account manager or contact, and how much to the institution
- Whether the client feels genuinely understood — that the provider knows their business, their goals, and what they actually need
- Whether the relationship is reactive or proactive — does the provider show up when problems arise, or does it anticipate and create value ahead of issues
- What the client would do if the relationship were to change — if the account manager left, if pricing changed, if a competitor approached them
- What the client would need to see to deepen the relationship — expand scope, extend contract, increase investment

**This domain cannot answer:**
- The quality of the service delivery at a transactional level — that is Post-Transaction Research
- How the provider is perceived across a market or customer base — that is NPS & Customer Loyalty Research
- Why a specific client left or is leaving — that is Exit & Departure Research in the Workforce family or B2B research
- What competitors are offering or whether the client is actively comparing — this domain can surface competitive vulnerability signals, but competitive intelligence is a separate study

---

## Section 3: Brief Interrogation Guide

**Relationship definition:**
- Who is the client respondent — their role, seniority, and their specific involvement in the relationship with the provider? The decision-maker who manages the contract has a different relationship experience from the day-to-day user of the service.
- How long has the relationship been in place, and has it had any major changes — account manager turnover, scope changes, pricing renegotiations, service failures? The history of the relationship shapes the current assessment.
- Is there a named account manager or primary contact on the provider side? If so, how long have they been in this role? Account manager tenure is a primary variable in relationship health research.

**Relationship scope:**
- What is the scope of the relationship being studied — does the client use one service or product line, or multiple? Research that spans multiple service lines must track which experiences belong to which service, otherwise findings are confounded.
- Is the research focused on the relationship overall, or on a specific dimension — the renewal decision, a recent change, a specific aspect of service quality?

**Client's known concerns:**
- Does the provider have a hypothesis about what is at risk in this relationship? What signals has the account team observed that triggered the research?
- Has there been a recent change in the relationship — a new account manager, a pricing change, a service failure, a change in the client's business that may have shifted their needs? These are essential context for interpreting findings.

**Incomplete answer probes:**
- If the provider describes the relationship as "generally healthy": "What signals specifically make you say that? And what signals, if you're honest, make you less certain?"
- If the provider cannot describe the client's perspective: "If that client were talking to a colleague today about their relationship with you — what would they say? What would you hope they'd say, and what would you be worried they'd say?"

---

## Section 4: Decision Map Interrogation

**Questions to ask:**
- If the research shows the relationship is strong but the client is person-dependent — the health rests primarily on the account manager rather than the institution — what decision does that inform? Succession planning? Relationship depth-building beyond the named contact?
- If the research shows the relationship is at risk — unmet expectations, perceived value erosion, or competitive vulnerability — what decision does that inform? Specific actions the account team will take? Relationship repair investment?
- If the research shows the relationship is healthy but the client is not using the full scope of what is available to them — unexplored service lines, unaddressed needs — what decision does that inform? A proactive conversation with the client? A scope expansion proposal?

**Well-formed decision map example:**
> Positive finding (relationship is healthy, mutual trust is strong, client is person-independent): No immediate action required; document the relationship quality drivers as a model for other accounts.
> Negative finding (relationship is at risk — value erosion or personnel dependency): The account team convenes a client relationship recovery plan within 30 days.
> Expansion finding (healthy relationship, unaddressed needs identified): Account manager initiates a conversation specifically about [unaddressed area] within the next client meeting cycle.

---

## Section 5: Coverage Model Specification

Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Overall Relationship Health | 15% | Root | 0.80 |
| — Current strength and direction of travel | 8% | Overall Health | 0.75 |
| — Emotional quality of the partnership | 7% | Overall Health | 0.70 |
| Account Manager Relationship Quality | 25% | Root | 0.80 |
| — Personal trust and chemistry | 10% | Account Manager | 0.75 |
| — Proactivity and business understanding | 15% | Account Manager | 0.80 |
| Institutional Relationship Quality | 20% | Root | 0.75 |
| — Service delivery reliability and communication | 12% | Institutional | 0.75 |
| — Perceived expertise and strategic value | 8% | Institutional | 0.70 |
| Value Perception | 20% | Root | 0.75 |
| — ROI and value-for-investment sense | 12% | Value Perception | 0.75 |
| — Comparison to alternatives (implicit or explicit) | 8% | Value Perception | 0.70 |
| Relationship Resilience | 20% | Root | 0.75 |
| — Person-dependence risk: what happens if the account manager changes | 8% | Resilience | 0.70 |
| — Expansion likelihood: unaddressed needs or scope growth potential | 7% | Resilience | 0.65 |
| — Renewal intent and relationship future | 5% | Resilience | 0.65 |

Critical nodes: Account Manager — Proactivity and Business Understanding is the highest-weight sub-node in the model. Research on professional client relationships consistently identifies proactivity — the provider anticipating needs rather than reacting to them — as the primary differentiator between relationships that thrive and relationships that merely survive.

---

## Section 6: Audience Model Interrogation Guide

**Psychographic dimensions that matter:**
- Decision-making role: The client contact who controls the contract and renewal is the most important research participant in this domain, but they may have the least day-to-day visibility into the relationship quality. The day-to-day user of the service has the most detailed experience but may not be the decision-maker. The brief must clarify which role is being studied.
- Relationship tenure: Long-tenured client contacts have a relationship history and a set of expectations calibrated over time. New client contacts who inherited a relationship from a predecessor are still forming their own assessment. The research approach differs.
- Business context: The client's current business situation shapes their relationship needs. A client in a period of rapid growth has different needs from a client in a period of consolidation. The brief must document any significant changes in the client's business context.

**Social desirability flags:**
- Client respondents may soften criticism because they like the account manager personally and do not want to harm the relationship through the research. This produces positive assessments of the person combined with softer assessments of the institutional delivery.
- Client respondents may exaggerate positive assessments if they believe the research will be shared directly with their account team — they are investing in the relationship they want, not reporting the relationship they have.

**Sensitivity flags:**
- If the research is being conducted during an active contract negotiation or renewal discussion, the client respondent may be using the research as a leverage instrument — emphasizing concerns that have commercial implications. The Creation agent must ask whether any participants are in an active negotiation and flag this.
- In professional service relationships, the client contact may have personal relationships with individuals at the provider that make candid institutional assessment difficult. The Creation agent must ask whether the research design allows for this and whether the client contact is aware of who will see the findings.

---

## Section 7: Constitutional Constraints

1. **Account manager tenure must be documented.** The brief must record how long the current account manager has been in role. Research shows that client relationship quality is highly sensitive to account manager tenure — a newly assigned account manager is a structural vulnerability regardless of their individual quality.

2. **The person-institution distinction must be an explicit research objective.** The brief must state that the research will separately assess the quality of the account manager relationship and the institutional relationship. Without this separation, findings are not actionable — the provider cannot know whether to invest in training an individual or in changing an institutional process.

3. **Active negotiation status must be documented.** If any participant is in an active contract renegotiation, this must be flagged so the Conducting agent can handle leverage-motivated answers with appropriate analytical caution.

4. **The client respondent's role and visibility must be documented.** "The client" is not a sufficient population description. The brief must characterize the respondent's decision-making authority and their day-to-day visibility into the relationship — these two dimensions are often inverted and the gap between them is analytically significant.

---

## Section 8: Duration Calibration Guide

| Relationship Scope | Account History | Minimum Session Duration |
|---------------------|-----------------|--------------------------|
| Single service line, stable relationship | Under 2 years | 30–35 minutes |
| Single service line, complex history | 2+ years or significant changes | 40–45 minutes |
| Multi-service relationship | Any | 45–55 minutes |
| Strategic or high-value account | Any | 50–60 minutes |

Strategic account sessions require more warmup time because the respondent is a senior professional whose time is constrained and who needs to feel the conversation is worth their investment before they will engage with depth.

---

## Section 9: Handoff Checklist

- [ ] Client respondent role documented: decision-maker, day-to-day user, or both
- [ ] Relationship tenure documented
- [ ] Account manager identity and tenure documented
- [ ] Recent relationship changes documented: account manager change, scope change, pricing change, service failure
- [ ] Client's current business context characterized: growth, consolidation, disruption
- [ ] Provider's hypothesis about relationship risks documented
- [ ] Scope of studied relationship defined: single service line or multi-service
- [ ] Active negotiation status documented and flagged if applicable
- [ ] Social desirability risk characterized: personal loyalty to account manager; awareness of who sees findings
- [ ] Decision map: health-positive, at-risk, and expansion-opportunity outcome actions recorded
- [ ] Person-institution distinction confirmed as explicit research objective
- [ ] Session duration target confirmed against calibration guide
- [ ] Coverage model version number recorded (1.0.0)