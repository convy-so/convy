---
name: community-neighborhood-analytics
description: Use when interpreting community/neighborhood research. Audits "Emotional Geography" and "Place Gap."
id: be-community-neighborhood-analytics
version: 1.1.0
---

## Interpretation Framework
Focus on **Emotional Geography** (Safe/Exposed) over objective metrics. Divergence between Physical Quality and Emotional Experience is the primary finding. Distinguish between **Functional Space** (Services) and **Relational Space** (Cohesion).

## Absolute Rules
- VERIFY "Authority Deference." If the client is the landlord, apply a 20% reliability penalty to summary praise.
- PIERCE "Independence Framing." "I keep to myself" is a finding of **Social Isolation**, not a preference.
- SILENCE = RISK. Low coverage on Night Safety (Node 04b) is evidence of **Disclosure Reluctance**, not safety.
- BEHAVIOR > SENTIMENT. A resident's modified route (Behavior) outweighs their "It's fine" (Sentiment).

## Common Misreadings
| Misreading | Reality | Correction |
|---|---|---|
| Safety Silence | Reluctance due to fear/retaliation. | Report "Safety Evasion" pattern. |
| Independence | Standard cover for thin social fabric. | Report as "Social Isolation" risk. |
| Pride Mask | Reputation defense vs. lived difficulty. | Prioritize behavioral accounts (Section 4). |
| Physical Focus | The built environment is just the setting. | Report emotional impact, not design alone. |

## Node Interpretation & Weights
| Node | Focus | Indicator | Weighting |
|---|---|---|---|
| CN-02 | Cohesion | Real neighbor conversations vs. transactional nods. | 1.35x (Critical) |
| CN-04b| Safety | Night routes avoided or restricted activities. | 1.25x (Critical) |
| CN-01b| Emotion | Describability of the area's "Feeling." | 1.15x |
| CN-03b| Facility | Social infrastructure vs. functional services. | 1.10x |

## Quality Weighting (v1.1.0)
| Condition | Rule | Penalty/Boost |
|---|---|---|
| Auth. Deference | Positive summaries with landlord/authority check. | -0.60 Penalty (0.40x) |
| Specific Moment | Citing a literal "Movie Scene" from the route. | +0.35 Boost (1.35x) |
| Safety Evasion | "Generally fine" + modified routes elsewhere. | +0.25 Pattern Weight |
| Inconsistency | Global (+) vs. Specific (-) accounts. | Resolve ONLY in favor of Specific. |

## Standardized Output — "Emotional Geography Audit"
1. **Primary Finding:** (The single factor impacting daily life quality).
2. **Cohesion Index:** (Relational vs. Functional community profile).
3. **Safety Geographies:** (Temporal map—Day comfort vs. Night restriction).
4. **Behavioral Modifications:** (Routes avoided/activities forgone).
5. **Data Quality Profile:** (Authority Deference & Safety Evasion flags).

## Flagging Templates
**SAFETY EVASION (Night Risk):**
> "Coverage on Node 04b was limited. Deflection via 'minimization language' detected. Combined with route modifications described elsewhere, this indicates an **Active Safety Gap** suppressed by disclosure anxiety."

**AUTHORITY DEFERENCE:**
> "Resident aware of [Relationship] with commissioning entity. Positive summaries weighted at 0.40. Specific experiential accounts from the 'Core Phase' are the primary evidence."

**REPUTATION SHIELD (Pride Protection):**
> "Stated pride on Node 06 contradicts lived difficulty on Node 02/04. Findings prioritized based on **Behavioral Anchoring** over reputation defense."