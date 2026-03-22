---
name: Investment Behavior Research (Creation)
description: Briefing agent skill for designing Investment Behavior Research. Guides the Creation agent to extract a complete, validated research brief focusing on risk tolerance, market anxiety, and 'Gamified' trading psychology.
id: fn-investment-behavior-creation
version: 1.0.0
---

# Section 1: Domain Identity
Investment Behavior Research evaluates how humans handle risk and the future. Investing used to be a slow, institutional process (e.g., waiting 30 years for a pension). Now, it is instantaneous, gamified, and highly social (e.g., trading crypto on an app while reading Reddit). This domain measures the emotional drivers behind financial risk-taking. It diagnoses whether an investor is driven by long-term security, fear of missing out (FOMO), or the pure entertainment of gambling on markets. 

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why a specific demographic prefers holding Crypto over an S&P 500 Index Fund
- How a user physically feels when their portfolio drops 10% in a day (Panic vs Calm)
- Whether a new trading app's UI encourages irresponsible day-trading
- The role of social media in driving financial decisions

**Cannot answer:**
- Why a customer was denied a traditional mortgage (requires Banking Trust)
- What specific stocks will go up next month (requires Financial Advisory)

# Section 3: Brief Interrogation Guide
**The Risk Posture:**
- Is the client researching "Wealth Preservation" (older, conservative, terrified of losing money) or "Wealth Generation" (younger, aggressive, terrified of missing out on gains)? The AI must branch the brief here instantly.

**The Education vs Action Gap:**
- Does the client believe their users actually understand the assets they are buying (e.g., options contracts), or are they just blindly copying influencers?

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that your app's "confetti animation" upon buying a stock is causing novice users to treat investing like a casino, will you remove the animation to protect them, or keep it because it drives engagement?
- If users explicitly state they trust TikTok creators more than your certified financial advisors, will you start producing short-form video content?

**Well-formed decision map example:**
> Investment outcome: If the data shows that novice investors are terrified of the 'Options Trading' dashboard and view it as gambling, the product team will gate that feature behind a mandatory, 5-minute educational module. If the primary driver of Crypto adoption is 'Distrust of the Federal Reserve', the marketing team will pivot messaging to emphasize the decentralized security of the platform.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Risk Tolerance & Market Anxiety | 25% | Root | 0.85 |
| Social Proof & Influencer Impact (FOMO) | 20% | Root | 0.80 |
| Financial Goal Clarity (Retire vs Get Rich)| 20% | Root | 0.85 |
| UI/Gamification Influence on Trading | 20% | Root | 0.80 |
| Institutional vs Decentralized Trust | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Set-and-Forget Investor vs The Day Trader: The brief must establish the respondent's interaction frequency. Do they check their portfolio once a year, or 15 times a day?

# Section 7: Constitutional Constraints
1. **The 'Rational Actor' Fallacy.** The AI must never validate a brief that assumes investors operate on pure mathematical logic. The AI must force the client to accept that a vast majority of retail investing is driven by emotion, panic, social pressure, and hope.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| New App Feature Pulse Check | Low | 15–20 mins |
| Market Flash-Crash Reaction Autopsy | Moderate | 25–40 mins |
| Generational Wealth Transfer Study | High | 45–60 mins |

# Section 9: Handoff Checklist
- [ ] Risk posture (Preservation vs Generation) bounded
- [ ] Education vs Action assumption documented
- [ ] Audience baseline (Day Trader vs Passive) established
- [ ] Decision map outcome actions recorded for Product/Marketing
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Platform Outage Rage:** If the user doesn't care about the market but is furious because the app crashed while they were trying to sell a stock, this instantly shifts to **Digital Product: Usability & UX**.

## Inbound bridging nodes
When Investment Behavior is added as a secondary domain:
- `BRIDGE-fnib-metr-meme-adoption` (Activated when added to Trend & Behavior to determine if a demographic is buying an asset purely because it is a viral meme, rather than a sound financial investment)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your users knew for an absolute fact that the market would be flat for the next 5 years, how many of them would close their accounts tomorrow?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-fnib-*` node to calibrate exactly how much 'Boredom' the client's business model can survive.
