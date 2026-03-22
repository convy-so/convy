---
name: Content Resonance Research (Creation)
description: Briefing agent skill for designing Content Resonance Research. Guides the Creation agent to extract a complete, validated research brief focusing on emotional impact, character connection, and narrative engagement in media properties.
id: me-content-resonance-creation
version: 1.0.0
---

# Section 1: Domain Identity
Content Resonance Research is the autopsy of "The Story." While Audience Fragmentation measures *how* someone watches, this domain measures *what* they felt while watching. It is the qualitative layer beneath the quantitative Nielsen ratings. A show can have 10 million viewers but zero cultural resonance (background noise), or 1 million viewers and massive cultural resonance (a rabid fandom). This domain measures emotional stakes, character believability, and the "Watercooler Effect."

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why audiences actively hated the ending of a specific movie
- Which specific character the audience connected with most (and why)
- Whether a piece of sponsored content felt "authentic" or "cringey"
- The exact emotional state a user was in after finishing a podcast episode

**Cannot answer:**
- Why the streaming app crashed during the premiere (requires Streaming Experience)
- Why the marketing campaign failed to reach Gen-Z (requires Trend & Behavior)

# Section 3: Brief Interrogation Guide
**The Content Perimeter:**
- What exact property are we evaluating? Is it a single episode, a whole season, a newsletter, or an ad campaign? The AI must bound the creative perimeter immediately.

**The Creator's Hypothesis:**
- What emotion was the creator *trying* to evoke? (e.g., "We wanted the villain to be sympathetic"). The AI must document the creative intent so the Conducting agent can test if it actually landed.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that the audience finds your lead character deeply unlikable, will the writers room actually change the script for Season 2, or are you locked in?
- If readers say your newsletter is too academic, will you hire a new editor to change the tone?

**Well-formed decision map example:**
> Resonance outcome: If the data shows that 'Character A' is universally despised because their motivations are confusing, the showrunner will add two explanatory scenes into the Season 2 premiere. If audiences report that the podcast's 'comedic banter' is actually perceived as 'annoying filler,' the producers will cut the intro banter segment entirely.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Narrative Engagement (Plot/Pacing) | 25% | Root | 0.85 |
| Character/Host Connection & Authenticity | 25% | Root | 0.85 |
| Emotional Payoff (The Reaction) | 20% | Root | 0.80 |
| The 'Watercooler' Effect (Shareability)| 15% | Root | 0.75 |
| Cultural Relevance & Tone | 15% | Root | 0.80 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Superfan vs The Casual Viewer: The brief must establish the fandom level. A Superfan will critique the lore accuracy; a Casual Viewer will critique whether they were bored on a Tuesday night.

# Section 7: Constitutional Constraints
1. **The 'Creative Defense' Ban.** The AI must never validate a brief that asks to "Find out why they didn't understand our genius ending." The AI must force the client to accept that if the audience didn't understand it, the execution failed.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| 30-Second Ad 'Vibe' Check | Low | 15–20 mins |
| Pilot Episode Focus Group Replacement | Moderate | 25–40 mins |
| Multi-Season Franchise Post-Mortem | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Creative property explicitly bounded
- [ ] Creator's intended emotional hypothesis documented
- [ ] Target audience (Superfan vs Casual) established
- [ ] Decision map outcome actions recorded for the Creative Team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Format Failure:** If the audience loved the story but said "This should have been a 2-hour movie instead of a 10-hour series," this triggers **Media & Ent: Audience Fragmentation**.

## Inbound bridging nodes
When Content Resonance is added as a secondary domain:
- `BRIDGE-mecr-mipt-brand-authenticity` (Activated when added to Brand Perception to test if a brand's attempt at making "entertainment" instead of advertising is actually working)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If you had to delete one character or segment from this property to save budget, who/what would it be?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-mecr-*` node to identify the 'Creative Deadweight' the client already suspects exists.
