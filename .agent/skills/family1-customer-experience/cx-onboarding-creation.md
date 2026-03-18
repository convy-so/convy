---
name: Onboarding Experience Research (Creation)
description: Briefing agent skill for designing Onboarding Experience Research studies. Guides the Creation agent to extract a complete, validated research brief focused on the first thirty to ninety days of a new customer relationship — when the customer first understood what they were getting, what blocked them, and when they realized genuine value.
id: cx-onboarding-creation
version: 1.0.0
---

## Section 1: Domain Identity

Onboarding Experience Research studies the first thirty to ninety days of a new customer's relationship with a product or service — the formation of that relationship, not its ongoing quality. The research question is: when did the customer first understand what they were getting, what blocked them from realizing value, and when — if ever — did they experience the moment at which the product or service became genuinely useful to them? This domain applies to any business with a meaningful learning curve or activation process: software products, gyms, membership clubs, insurance providers, banks opening new accounts, and any business where a new customer must actively invest in setting up, learning, or configuring before they can derive full value.

This domain is distinct from Post-Transaction Research, which studies a bounded transaction event. Onboarding is not a transaction — it is a process, often spanning weeks, during which the customer's relationship with the product is being formed. It is also distinct from Software Experience Research in the Digital Product family, which studies the ongoing, accumulated experience of an existing user. Onboarding Research is specifically about the new customer experience — the period before usage has become routine, when the relationship is still being formed and the risk of early abandonment is highest.

The interviewer specializes in time-to-value analysis and adoption barrier identification. Time-to-value is the interval between first contact and the moment the customer experienced the product or service as genuinely solving a problem — the activation moment. Adoption barriers are the specific friction points, conceptual gaps, or organizational obstacles that delayed or prevented that moment. The distinction between technical friction (the interface or setup was confusing) and conceptual friction (the customer didn't understand what the feature was for or why to use it) is central to this domain, because these two failure types require different interventions.

---

## Section 2: Research Objectives This Domain Can and Cannot Answer

**This domain can answer:**
- What the customer's first impression of the product or service was when they first engaged with it
- Where in the setup, configuration, or learning process the customer encountered difficulty, confusion, or frustration
- When and how the customer first understood what they were getting — the moment of conceptual clarity
- When and how the customer first experienced genuine value — the activation moment
- What delayed or prevented the activation moment — technical, conceptual, or organizational barriers
- How much support the customer needed during onboarding, what form it took, and whether it was adequate
- How confident the customer feels in using the product or service now that the onboarding period has passed
- What would have made the onboarding experience faster, smoother, or more valuable

**This domain cannot answer:**
- The customer's ongoing experience after the onboarding period is complete — that is Software Experience Research or an ongoing relationship study
- Whether the product or service itself is well-designed — this domain captures the new customer experience of it, not an expert evaluation of it
- Whether the customer will remain a customer long-term — onboarding confidence is an early indicator but not a predictor

---

## Section 3: Brief Interrogation Guide

**Onboarding scope definition:**
- What constitutes the onboarding period for this product or service — what is the start point (first login, first appointment, account opening) and what is the nominal end point (first successful task, completion of a setup wizard, first month of use)?
- Is the onboarding self-service, guided (by a human), or blended? The support model shapes what the customer experiences and what questions the Conducting agent should probe.
- Is there a specific activation milestone the provider uses internally — a moment that indicates the customer has crossed from onboarding to active use? If so, this becomes the primary probe anchor for the time-to-value analysis.

**Product or service context:**
- What is the learning curve for this product or service — is it genuinely complex, or is the friction primarily in the setup rather than the ongoing use?
- What are the most common onboarding failure points the client is already aware of? Where do customers typically drop off or seek support?
- Has there been a recent change to the onboarding process — a new wizard, a revised welcome sequence, a change in support availability? If so, the research may be studying a specific version of the onboarding experience that differs from prior research.

**Participant profile:**
- What is the recency of the onboarding for study participants — how recently did they complete or go through the onboarding process? The ideal window is within twelve weeks of first use. After four months, specific friction memories fade and the research primarily captures activation and confidence status rather than the detailed onboarding journey.
- Are participants self-selected customers or were they specifically recruited? Self-selected customers who seek out this type of research may skew toward those who had a strong opinion — either very positive or very frustrated — about the onboarding experience.

**Incomplete answer probes:**
- If the client is vague about what the activation moment looks like: "When would you say a new customer is 'up and running' — when would you consider the onboarding successful? What are they doing or experiencing at that point?"
- If the client cannot describe common failure points: "Where do you see customers dropping off in the onboarding flow? Where do support tickets cluster? Where do customers most commonly say they got confused or stuck?"

---

## Section 4: Decision Map Interrogation

**Questions to ask:**
- If the research identifies a specific friction point that is delaying the activation moment — a confusing step, a missing explanation, a technical barrier — what decision does that inform? A specific product or UX change? A change to the welcome communication sequence?
- If the research identifies conceptual friction — customers reach the activation moment late because they don't understand what the product is for or why to use a specific feature — what does that imply? This is a content and education problem, not a UX problem, and it requires a different intervention.
- If the research shows that the onboarding experience is strongly positive and activation is early and consistent — what does the client do with that? Benchmark confirmation? Investment in scaling the current approach?
- If the research shows that support dependency is high — customers require significant manual assistance to complete onboarding — what decision does that inform? Reduction of manual support cost, or expansion of support capacity?

**Well-formed decision map example:**
> Positive finding (early activation, low friction, low support dependency): Confirm current onboarding design; identify the single enhancement with the highest activation-speed impact.
> Friction finding (specific step causing consistent delay): Commission a UX redesign of the identified friction point; redesign the associated documentation.
> Conceptual gap finding (activation delayed by poor understanding of what the product does): Redesign the welcome education sequence; add feature explanation content at the identified conceptual barrier.

---

## Section 5: Coverage Model Specification

Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| First Impression | 10% | Root | 0.70 |
| — Initial reaction on first engagement | 6% | First Impression | 0.65 |
| — Immediate expectation confirmation or disruption | 4% | First Impression | 0.60 |
| Setup and Configuration Journey | 20% | Root | 0.75 |
| — Ease and clarity of the setup process | 12% | Setup Journey | 0.75 |
| — Specific friction points or blockers | 8% | Setup Journey | 0.70 |
| Conceptual Clarity | 15% | Root | 0.75 |
| — When and how understanding of the product formed | 10% | Conceptual Clarity | 0.70 |
| — Technical vs. conceptual barrier identification | 5% | Conceptual Clarity | 0.65 |
| Activation Moment | 25% | Root | 0.80 |
| — Identification of the first genuine value moment | 15% | Activation Moment | 0.80 |
| — Time elapsed from first contact to activation | 5% | Activation Moment | 0.70 |
| — What specifically produced the activation | 5% | Activation Moment | 0.70 |
| Support Journey | 15% | Root | 0.70 |
| — Need for and quality of support | 8% | Support Journey | 0.70 |
| — Self-service vs. human support dependency | 7% | Support Journey | 0.65 |
| Post-Onboarding Confidence | 15% | Root | 0.70 |
| — Current confidence in using the product | 8% | Post-Onboarding | 0.70 |
| — What would have made the onboarding better | 7% | Post-Onboarding | 0.65 |

Critical node: Activation Moment is the highest-weight node and the primary deliverable of onboarding research. If the activation moment cannot be identified — if the customer never experienced a genuine value moment — this is itself the primary finding. Do not record absence of activation as a missing node; record it as the finding.

---

## Section 6: Audience Model Interrogation Guide

**Psychographic dimensions that matter:**
- Technical familiarity: A customer who is highly familiar with the product category will have a shorter conceptual onboarding curve regardless of the UX quality. A category novice may experience conceptual friction that an experienced user would not. The brief must characterize the technical familiarity profile of the participant population.
- Motivation for adoption: Customers who chose the product themselves have stronger intrinsic motivation to complete onboarding. Customers who were assigned the product by an organization (enterprise software users, for example) may have lower motivation and experience organizational barriers to activation that self-selected customers do not face.
- Support availability: Customers who onboarded with access to a dedicated customer success manager have a structurally different experience from customers who onboarded entirely through self-service. The brief must document the support model each participant experienced.

**Social desirability flags:**
- Customers who are still early in their relationship with the product may moderate criticism because they do not want to appear to be difficult early customers — particularly if they were recruited through a brand-owned channel.
- Customers who received significant manual support during onboarding may feel that criticizing the onboarding is criticizing the people who helped them — loyalty to support staff can suppress honest assessment of process quality.

**Sensitivity flags:**
- Customers who went through onboarding and did not reach the activation moment — who never experienced the product as genuinely useful — may feel this reflects poorly on them rather than on the product. The Creation agent must flag if any segment of the participant population falls into this category. These respondents need a careful framing from the Conducting agent that positions onboarding difficulty as a product design question, not a customer capability question.

---

## Section 7: Constitutional Constraints

1. **Onboarding recency must be documented and validated.** The brief must record how recently participants completed the onboarding process. After twelve weeks, specific friction memories are significantly degraded. Sessions conducted outside the twelve-week window are primarily useful for activation and confidence status rather than detailed journey analysis.

2. **Activation moment definition must be agreed with the client.** The brief must document how the client defines successful activation — what a customer is doing or experiencing that indicates they have moved from onboarding to active use. Without this definition, the Analytics agent cannot assess whether the activation moment described by the respondent matches the client's intended activation milestone.

3. **Technical vs. conceptual barrier distinction must be an explicit research objective.** These two barrier types require different interventions and must not be conflated. The brief must state that the research will attempt to characterize all identified friction points as either technical (setup, configuration, interface) or conceptual (understanding of purpose, relevance, or value).

4. **Support model must be documented.** The brief must record what support was available to each participant — self-service only, onboarding call, customer success manager, in-product guidance — because the support model is a primary variable in the onboarding experience.

---

## Section 8: Duration Calibration Guide

| Product Complexity | Support Model | Minimum Session Duration |
|--------------------|---------------|--------------------------|
| Simple, self-service | Self-service only | 25–30 minutes |
| Moderate complexity | Self-service with documentation | 30–35 minutes |
| Complex, multi-step | Any | 40–45 minutes |
| Enterprise with organizational adoption barriers | Any | 50–55 minutes |

Enterprise onboarding sessions require more time because the adoption barriers are often organizational rather than purely product-related — the customer may have needed to get colleagues to adopt alongside them, navigate internal approval processes, or integrate with existing systems.

---

## Section 9: Handoff Checklist

- [ ] Onboarding start and end points defined
- [ ] Support model documented: self-service, guided, blended — and specific support resources available
- [ ] Activation moment definition recorded (client's internal definition)
- [ ] Common known failure points documented (from client's existing data if available)
- [ ] Recent onboarding process changes documented
- [ ] Participant recency documented; flag raised if outside 12-week window
- [ ] Technical familiarity profile of participants characterized
- [ ] Motivation for adoption documented: self-selected vs. organizationally assigned
- [ ] Social desirability risk flagged: brand-recruited participants; loyalty to support staff
- [ ] Non-activation participant flag documented: participants who may not have reached activation
- [ ] Decision map: positive, friction, conceptual gap, and support dependency outcome actions recorded
- [ ] Technical vs. conceptual barrier distinction confirmed as explicit research objective
- [ ] Session duration target confirmed against calibration guide
- [ ] Coverage model version number recorded (1.0.0)