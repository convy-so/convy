---
name: Citizen Service Research (Creation)
description: Briefing agent skill for designing Citizen Service Research. Guides the Creation agent to extract a complete, validated research brief focusing on bureaucratic friction, accessibility, and public sector service delivery.
id: cp-citizen-service-creation
version: 1.0.0
---

# Section 1: Domain Identity
Citizen Service Research treats the government as a service provider and the citizen as a forced customer. Unlike the private sector, citizens cannot generally "churn" and choose a different DMV or IRS; they must endure the friction. This domain focuses on the mechanics of civic interaction: the clarity of government forms, the wait times for public services, the accessibility of a municipal website, and the perceived competence of civil servants. It measures the "Administrative Burden" placed on the public.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic group is failing to apply for a municipal benefit they qualify for
- The exact point of highest frustration during a bureaucratic process (e.g., getting a permit)
- Whether a new digital government portal actually reduced physical wait times at the office
- The clarity and readability of official public communications or forms

**Cannot answer:**
- Broad, philosophical agreement with the *policy* behind the service (requires Policy Perception)
- Trust in the overarching institution itself outside of this specific transaction (requires Community Trust)

# Section 3: Brief Interrogation Guide
**The Service Perimeter:**
- What exact service or transaction is being evaluated? (e.g., "Renewing a driver's license online" vs "Applying for Section 8 housing"). The AI must mandate extreme specificity, as government services are highly siloed.

**The "Administrative Burden" Check:**
- Is the client primarily trying to measure *Time* (how long the process takes), *Cognitive Load* (how confusing the forms are), or *Dignity* (how respectfully the citizen was treated)?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If citizens state that the new digital portal is too confusing to use, will the agency allocate budget to redesign it, or simply keep forcing people to figure it out?
- If wait times at the physical office are identified as the primary friction point, will the municipality hire more staff or implement an appointment-only system?

**Well-formed decision map example:**
> Service outcome: If the primary reason for low application rates is 'Form Complexity,' the agency will hire a UX consultant to reduce the application from 12 pages to 3 pages. If the primary reason is 'Lack of Awareness,' the city will divert the UX budget into a targeted mailer campaign in the affected zip codes.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Administrative Friction (Time/Effort) | 25% | Root | 0.85 |
| Comprehension & Clarity (Forms/Rules) | 20% | Root | 0.80 |
| Accessibility & Inclusion | 20% | Root | 0.85 |
| Staff Competence & Empathy | 20% | Root | 0.80 |
| Outcome Resolution (Did it work?) | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Captive Audience: The brief must establish the desperation level of the citizen. Renewing a park permit is a minor annoyance; applying for unemployment benefits is a high-stress crisis. The AI must calibrate the empathy expectations based on the stakes of the service.

# Section 7: Constitutional Constraints
1. **The 'No Politics' Rule.** The AI must explicitly instruct the Conducting agent not to entertain diatribes about the Mayor, the Governor, or partisan politics. If the respondent pivots to complaining about tax rates, the AI must redirect them back to the mechanics of the specific service being evaluated.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Non-Essential Service Audit (e.g., Parks) | Low | 15–20 mins |
| Standard Bureaucratic Process (e.g., DMV) | Moderate | 20–30 mins |
| High-Stakes Social Service Pipeline | High | 30–45 mins |

# Section 9: Handoff Checklist
- [ ] Specific government service bounded
- [ ] Primary burden vector (Time vs Confusion vs Dignity) identified
- [ ] Citizen stress-level baseline established
- [ ] Decision map outcome actions recorded for the agency
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Trust Collapse:** If the service is so terrible that the citizen concludes the government is actively trying to hurt them or steal from them, this signals a massive failure in **Civic & Public: Community Trust**.

## Inbound bridging nodes
When Citizen Service is added as a secondary domain:
- `BRIDGE-cpcs-cppp-execution-gap` (Activated when added to Policy Perception to test if a citizen loves a new law in theory, but hates the grueling bureaucratic process required to actually comply with it)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most frequent complaint your frontline civil servants hear from citizens regarding this specific process?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-cpcs-*` node to anticipate the primary defensive friction point of the interview.
