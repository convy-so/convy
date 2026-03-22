---
name: Streaming Experience Research (Creation)
description: Briefing agent skill for designing Streaming Experience Research. Guides the Creation agent to extract a complete, validated research brief focusing on subscription churn, platform UI/UX friction, and the paradox of choice in content libraries.
id: me-streaming-experience-creation
version: 1.0.0
---

# Section 1: Domain Identity
Streaming Experience Research evaluates the "Container" of the media, not the media itself. A streaming platform (video, audio, or gaming) is fundamentally a digital utility. This domain measures the friction of finding something to watch/listen to, the perceived value of the monthly subscription, and the triggers that cause a user to cancel one service in favor of another. It sits at the intersection of Digital Product UX and pricing strategy.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why users are cancelling their subscription after watching one specific show
- Whether the "Recommended" algorithm is actually helping users find content or just annoying them
- The exact point of friction that causes a user to close the app and open a competitor
- The perceived value of an ad-supported tier versus a premium tier

**Cannot answer:**
- Why the season finale of a specific show was poorly received (requires Content Resonance)
- Why users are abandoning long-form video for TikTok (requires Audience Fragmentation)

# Section 3: Brief Interrogation Guide
**The Subscription Catalyst:**
- Are we evaluating Acquisition (why they signed up) or Retention/Churn (why they are cancelling)? The AI must branch the brief here; the psychology of buying is completely different from the psychology of cancelling.

**The "Library vs Hero" Assumption:**
- Does the client believe users subscribe for the entire library of content, or just for one "Hero" property (e.g., *Stranger Things*)? The research must be designed to test this assumption.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If the research proves that users spend 20 minutes scrolling your UI and then close the app in frustration, will you redesign the homepage, or just buy more content?
- If users explicitly state that the addition of unskippable ads makes the platform feel "cheap," will you revise the ad-load strategy?

**Well-formed decision map example:**
> Streaming outcome: If the primary driver of churn is 'Hero Property Completion' (they watched the one show they wanted and left), product strategy will implement a post-finale 'Immediate Hook' UI that auto-plays a highly correlated pilot episode. If the driver of churn is 'Price Sensitivity,' marketing will roll out a paused-subscription option instead of outright cancellation.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Subscription Value (Cost vs Output) | 25% | Root | 0.85 |
| The Paradox of Choice (Scroll Fatigue) | 20% | Root | 0.80 |
| Discovery & Algorithm Trust | 20% | Root | 0.85 |
| UI/UX Friction (The Container) | 20% | Root | 0.80 |
| Competitor Switching/Stacking | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Serial Churner vs The Loyal Subscriber: The brief must establish if the user treats subscriptions like a utility bill (always on) or a rental (turns it on for one month, binges, and cancels).

# Section 7: Constitutional Constraints
1. **The 'Blame the Content' Ban.** The AI must never allow a Product/Tech team to blame high churn entirely on the Creative team (e.g., "Our shows just aren't good enough right now"). The AI must force the Product team to investigate whether their UI is actively burying the good shows.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Ad-Tier Tolerance Check | Low | 15–20 mins |
| App Redesign UX Audit | Moderate | 25–35 mins |
| Post-Price-Hike Churn Autopsy | High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Catalyst phase (Acquisition vs Churn) bounded
- [ ] Library vs Hero assumption documented
- [ ] Target audience (Serial Churner vs Loyal) established
- [ ] Decision map outcome actions recorded for Product/UX
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Pricing Failure:** If the user loves the UI, loves the content, but mathematically cannot afford the service anymore due to inflation, this shifts to **Commerce & Retail: Pricing & Value**.

## Inbound bridging nodes
When Streaming Experience is added as a secondary domain:
- `BRIDGE-mese-cplo-habit-loyalty` (Activated when added to Loyalty & Rewards to see if offering a 'free year of streaming' is actually a high-value perk to a credit card customer)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"If your platform crashed for 48 hours, what is the exact alternative app your users would open instead?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-mese-*` node to establish the immediate competitive threat matrix the Conducting agent must measure against.
