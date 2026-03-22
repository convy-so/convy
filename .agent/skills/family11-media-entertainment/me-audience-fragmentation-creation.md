---
name: Audience Fragmentation Research (Creation)
description: Briefing agent skill for designing Audience Fragmentation Research. Guides the Creation agent to extract a complete, validated research brief focusing on attention scarcity, platform fatigue, and tribal content consumption.
id: me-audience-fragmentation-creation
version: 1.0.0
---

# Section 1: Domain Identity
Audience Fragmentation Research evaluates the collapse of the "Monoculture." Today's media landscape is entirely tribalized; very few pieces of content capture everyone at once. This domain measures how consumers split their finite attention across competing screens, platforms, and formats. It diagnoses whether a media property is suffering from format exhaustion (e.g., getting tired of 3-hour podcasts) or platform exhaustion (e.g., deleting TikTok). This is the macro-layer of the media diet.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic abandoned traditional TV for YouTube micro-docs
- The exact context in which a user chooses a podcast over an audiobook
- Whether a consumer feels actively overwhelmed or burnt out by their own media diet
- How algorithmic "For You" pages influence brand discovery

**Cannot answer:**
- Why the UI on the Netflix app is frustrating (requires Streaming Experience)
- Why the plot of Episode 3 of a specific show was boring (requires Content Resonance)

# Section 3: Brief Interrogation Guide
**The Attention Audit:**
- What specific media format or platform is the client trying to diagnose? (e.g., "Why are Gen-Z males returning to long-form audio?"). The AI must anchor the brief to a specific attention trend, not just a vague question about "The Media."

**The Second-Screen Hypothesis:**
- Does the client assume their content commands 100% focused attention, or do they understand it is likely being consumed passively while the user is doing something else (e.g., scrolling Instagram while watching TV)?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your target audience only consumes your content passively while playing video games, will you pivot your production style to be "Audio-First"?
- If respondents clearly state they are exhausted by 60-second short-form video, will marketing actually fund a 20-minute documentary campaign?

**Well-formed decision map example:**
> Fragmentation outcome: If the primary driver of podcast abandonment is 'Commute Elimination' (people working from home), the production team will pivot from releasing one 60-minute episode a week to releasing three 15-minute 'Coffee Break' episodes a week. If the primary discovery engine is TikTok clips, the network will allocate 30% of the show's budget strictly to clipping editors.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| The Attention Economy (Time/Focus) | 25% | Root | 0.85 |
| Format Preferences (Short vs Long) | 20% | Root | 0.80 |
| Algorithmic Trust & Discovery | 20% | Root | 0.85 |
| Second-Screen/Passive Consumption | 20% | Root | 0.80 |
| Platform Fatigue & Digital Detox | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Curators vs The Grazers: The brief must establish if the target audience meticulously curates their own media (e.g., Substack/Patreon subscribers) or if they just open an app and let the algorithm feed them (TikTok/YouTube Shorts).

# Section 7: Constitutional Constraints
1. **The 'Pure Focus' Myth Ban.** The AI must never allow the client to demand answers to "How can we force them to stop looking at their phones while watching our show?" The AI must force the client to accept that divided attention is the baseline reality of modern media consumption, and the product must be built for it.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Format Preference Pulse Check | Low | 15–20 mins |
| 'Media Diet' Anthropology Study | Moderate | 25–40 mins |
| Generational Shift Meta-Analysis | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Attention trend/format clearly bounded
- [ ] Active vs Passive consumption assumptions documented
- [ ] Audience baseline (Curator vs Grazer) established
- [ ] Decision map outcome actions recorded for Programming Leadership
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Format specific failure:** If the user hates the overarching media diet but specifically names an egregious subscription cost on a streamer as the trigger, this requires **Media & Ent: Streaming Experience**.

## Inbound bridging nodes
When Audience Fragmentation is added as a secondary domain:
- `BRIDGE-meaf-mibt-format-shift` (Activated when added to Trend & Behavior to determine if a sudden spike in a product's popularity is purely due to the format it was advertised in, e.g., TikTok Shorts vs Print)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most terrifying media trend your executives talk about behind closed doors?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-meaf-*` node to ensure the Conducting agent actively probes for the existential threat the client is worried about.
