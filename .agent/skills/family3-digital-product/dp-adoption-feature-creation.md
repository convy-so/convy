---
name: Adoption & Feature Testing Research (Creation)
description: Briefing agent skill for designing Adoption & Feature Research. Guides the Creation agent to extract a complete, validated research brief focusing on why users ignore new features, onboarding friction, and long-term engagement mechanics.
id: dp-adoption-feature-creation
version: 1.0.0
---

# Section 1: Domain Identity
Adoption & Feature Testing Research answers the question: *Why aren't they using the thing we built?* Product teams frequently launch features that users requested, only to see a 2% adoption rate. This domain diagnoses the gap between launch and habit. It evaluates onboarding education, discoverability, perceived "setup tax" (the effort required to start using a feature), and whether the feature actually justifies changing a deeply ingrained digital habit.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific, newly launched feature is being ignored by the user base
- Whether the onboarding sequence successfully taught the user how to get value
- The perceived "Switching Cost" of adopting the new feature over their old method
- If users understand the marketing language used to describe the feature

**Cannot answer:**
- Whether the button to access the feature is too small to click on mobile (requires Usability & UX)
- The overall systemic churn risk of the entire platform (requires Software Experience)

# Section 3: Brief Interrogation Guide
**The Subject Perimeter:**
- Are we testing *Initial Onboarding* (Day-1 usage for a new user) or *Feature Adoption* (getting an existing, 3-year user to try a brand new tool)? The AI must differentiate these, because an existing user has habits that are extremely hard to break.

**The Awareness Check:**
- Has the client verified that the users even know the feature exists? The brief must establish if this is a "Discoverability" problem or an "Activation" problem.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If users state that the new AI scheduling feature takes too long to set up, will you invest in a "1-click import" tool, or just write better tutorial articles?
- If existing users refuse to use the new dashboard because they prefer the old one, will you force-migrate them, or maintain both versions?

**Well-formed decision map example:**
> Adoption outcome: If the primary reason for low adoption is verified as 'Setup Friction,' the product team will allocate the next sprint to building a data-import wizard. If the reason is 'Lack of Relevance' (users just don't need the feature), marketing will stop promoting it and it will be moved to a secondary menu.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Discoverability & Awareness | 20% | Root | 0.85 |
| The Setup Tax (Friction) | 25% | Root | 0.85 |
| The 'Aha!' Moment (Value Realization) | 20% | Root | 0.80 |
| Habit Disruption (The Existing Workflow) | 20% | Root | 0.80 |
| Educational Material Efficacy | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Change Aversion Index: The brief must establish if the user base is highly resistant to change (e.g., accountants using the same software for 10 years) or novelty-seeking (e.g., early-adopter productivity nerds).

# Section 7: Constitutional Constraints
1. **The 'Sales Pitch' Ban.** The AI must ensure the Conducting module is explicitly forbidden from "convincing" the user that the feature is good. If the user doesn't see the value, the AI must document the failure, not explain the value proposition to them.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Single Feature Awareness Check | Low | 10–15 mins |
| Standard Day-1 Onboarding Audit | Moderate | 20–30 mins |
| Complex Feature Migration Study | High | 30–45 mins |

# Section 9: Handoff Checklist
- [ ] Onboarding vs Existing Feature Migration established
- [ ] "Awareness" baseline defined by the client
- [ ] 'Sales Pitch' ban explicitly enforced
- [ ] Decision map outcome actions recorded for feature strategy
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Complete Feature Blindness:** If the user literally cannot find the feature even when told to look for it, this signals a massive failure in **Digital Product: Usability & UX**.

## Inbound bridging nodes
When Adoption & Feature Testing is added as a secondary domain:
- `BRIDGE-dpaf-dpse-utility-transfer` (Activated when added to Software Experience to see if adding one specific new feature would completely change their perception of the core software)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the exact marketing phrasing or notification text you are currently using to announce this feature to users?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-dpaf-*` node to test if the terminology itself is causing the confusion.
