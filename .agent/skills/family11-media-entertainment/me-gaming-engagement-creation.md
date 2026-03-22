---
name: Gaming Engagement Research (Creation)
description: Briefing agent skill for designing Gaming Engagement Research. Guides the Creation agent to extract a complete, validated research brief focusing on player retention, monetization mechanics, and community toxicity.
id: me-gaming-engagement-creation
version: 1.0.0
---

# Section 1: Domain Identity
Gaming Engagement Research evaluates the intersection of "Play" and "Monetization." Interactive media (video games) requires a fundamentally different research approach than passive media (TV/Film). A player does not just watch a game; they live in it, they invest money in it via micro-transactions, and they socialize within it. This domain diagnoses why players churn from "Live Service" games, how they feel about the "Grind" (progression mechanics), and how the community culture attracts or repels new players.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why players are abandoning the game after 40 hours of playtime
- Whether a new monetization system (e.g., Battle Pass) feels "fair" or "predatory"
- The impact of community toxicity on new-player retention
- Whether the core gameplay loop (the primary mechanical action) is actually fun

**Cannot answer:**
- How difficult it was to physically install the hardware (requires Physical Product)
- Why the marketing trailer failed to get clicks on YouTube (requires Content Resonance)

# Section 3: Brief Interrogation Guide
**The 'Live Service' Context:**
- Is this a single-player narrative game (one-time purchase) or a Live Service multiplayer game (requires constant updates and micro-transactions)? The AI must branch the brief instantly; retention means different things for these two models.

**The Monetization Hypothesis:**
- What is the client's current monetization strategy? The AI must document the specific financial friction point (e.g., "We added $20 cosmetic skins and the community revolted").

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your 'Loot Box' mechanics are viewed as predatory and are causing veteran players to quit, will you completely restructure the economy, or just lower the prices?
- If female players report extreme toxicity in voice chat, will you ban the toxic players even if they are 'whales' (high-spenders)?

**Well-formed decision map example:**
> Gaming outcome: If the primary 'Churn Catalyst' is the steep learning curve for new players, the development team will dedicate the next season entirely to rebuilding the tutorial. If the primary catalyst is 'Pay-to-Win' accusations, the studio will remove all stat-boosting items from the real-money store and restrict it to cosmetics only.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Core Loop "Fun Factor" & Pacing | 25% | Root | 0.85 |
| Progression vs The "Grind" | 20% | Root | 0.80 |
| Monetization Fairness (Micro-transactions)| 25% | Root | 0.85 |
| Community Culture & Toxicity | 15% | Root | 0.80 |
| Onboarding & Mechanics Clarity | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The "Whale" vs The "Free-to-Play" User: The brief must establish the financial investment of the target cohort. A player who spent $500 on the game expects a fundamentally different experience than someone who downloaded it for free.

# Section 7: Constitutional Constraints
1. **The 'Skill Issue' Ban.** The AI must never validate a client's defense that "the players just aren't good enough at the game." The AI must force the client to accept that if the target audience cannot figure out the mechanics, the mechanics are poorly designed.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| New Feature/Map Vibe Check | Low | 15–20 mins |
| Battle Pass / Monetization Audit | Moderate | 25–35 mins |
| Veteran Player 'Churn' Post-Mortem | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Game model (Single-Player vs Live Service) bounded
- [ ] Monetization strategy/friction point documented
- [ ] Player investment tier (Whale vs F2P) established
- [ ] Decision map outcome actions recorded for the Dev Team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **UX Catastrophe:** If the player loves the actual game but cannot figure out how to add their friends to a party because the menus are broken, this requires **Digital Product: Usability & UX**.

## Inbound bridging nodes
When Gaming Engagement is added as a secondary domain:
- `BRIDGE-mege-mipt-sunk-cost` (Activated when added to Pricing & Value to determine if players are violently defending a bad game simply because they have already spent $100 on it)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What specific feature or mechanic does the most vocal, angry segment of your community constantly complain about on Reddit/Discord?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-mege-*` node to establish the difference between "Loud Reddit Complaints" and actual behavior of the silent majority.
