---
name: Usability & UX Research (Creation)
description: Briefing agent skill for designing Usability & UX Research. Guides the Creation agent to extract a complete, validated research brief focusing on software navigation, cognitive load, and interface friction.
id: dp-usability-ux-creation
version: 1.0.0
---

# Section 1: Domain Identity
Usability & UX Research is the diagnostic engine for digital interfaces. It answers the question: *Can the user easily accomplish their goal, or did our design get in the way?* This domain is highly granular, focusing on the mechanical interaction between a human brain and a screen. It evaluates navigation architecture, button placement, labeling clarity, and the amount of mental energy (cognitive load) required to complete a digital task.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Exactly where users get lost or confused in a digital workflow
- Whether the terminology used in the app makes sense to an average person
- How many "clicks" or "taps" feel like too many for a specific action
- Why a specific feature is being completely ignored by users

**Cannot answer:**
- Whether the software actually solves a real business problem (requires Software Experience)
- How the software integrates with third-party tools (requires Platform Ecosystem)

# Section 3: Brief Interrogation Guide
**The Prototype Fidelity:**
- What level of fidelity is being tested? (The brief must explicitly state if the user is testing a static wireframe, a clickable Figma prototype, or live code. Testing static images requires vastly different allowances than testing live code).

**The Task Perimeter:**
- What are the absolute "Must-Complete" tasks? UX research fails when users are just told to "look around." The brief must define specific, targeted missions (e.g., "Find the cancellation button," "Update your billing address").

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If users consistently fail to find the 'Save' button, will the design team pause the upcoming sprint to move it, or push it to v2?
- If the new checkout flow takes 30 seconds longer but looks 'cleaner' to the UX team, which metric wins—speed or aesthetics?

**Well-formed decision map example:**
> UX outcome: If the 'Time on Task' for the new onboarding flow is 20% higher than the baseline due to confusion, the design team will revert to the old flow. If respondents successfully complete the onboarding but complain about the color scheme, we will launch on schedule but log the UI complaints for the next aesthetic pass.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Task Completion (Pass/Fail) | 35% | Root | 0.90 |
| Information Architecture (Navigation) | 20% | Root | 0.85 |
| UI & Element Clarity (Labels/Buttons) | 15% | Root | 0.80 |
| Cognitive Friction (Confusion) | 20% | Root | 0.85 |
| System Feedback (Error Handling) | 10% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- Digital Literacy: The brief must establish the baseline tech-savviness of the cohort. A confusing interface for a senior citizen might be deeply intuitive for a teenager. The AI must anchor expectations to the demographic's digital literacy.

# Section 7: Constitutional Constraints
1. **The 'No Rescue' Rule.** The AI must explicitly establish if the Conducting agent is allowed to tell the user where to click if they get completely stuck, or if the agent must let them fail the task entirely to prove the design is broken.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Single Flow (e.g., Password Reset) | Low | 10–15 mins |
| Core Application Walkthrough | Moderate | 20–30 mins |
| Complex B2B Dashboard Audit | High | 30–45 mins |

# Section 9: Handoff Checklist
- [ ] Prototype fidelity established (Figma vs Live)
- [ ] "Must-Complete" tasks explicitly documented
- [ ] Digital literacy baseline defined
- [ ] Decision map outcome actions recorded for the UX team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Feature irrelevance:** If the user easily completes the task but says "I would never actually use this feature in real life," this immediately signals a need for **Digital Product: Adoption & Feature Testing**.

## Inbound bridging nodes
When Usability & UX is added as a secondary domain:
- `BRIDGE-dpux-dpse-ui-frustration` (Activated when added to Software Experience to see if their hatred of the software is purely due to a bad interface, or a bad core utility)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What device or screen size are the majority of these respondents expected to be using during this test?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-dpux-*` node to anticipate mobile vs desktop navigation paradigms (e.g., hamburger menus vs top navs).
