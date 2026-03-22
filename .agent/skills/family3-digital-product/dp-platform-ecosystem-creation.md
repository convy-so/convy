---
name: Platform Ecosystem Research (Creation)
description: Briefing agent skill for designing Platform Ecosystem Research. Guides the Creation agent to extract a complete, validated research brief focusing on third-party integrations, developer sentiment, and marketplace dependency.
id: dp-platform-ecosystem-creation
version: 1.0.0
---

# Section 1: Domain Identity
Platform Ecosystem Research treats the software not as a standalone tool, but as a hub. It answers the question: *Does this software play nicely with everything else the user relies on?* This domain evaluates the API experience, third-party marketplace integrations, data portability, and the "walled garden" effect. It is the core research domain for products like Salesforce, Shopify, or AWS, where the value is largely derived from how well the product connects to external systems.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Which specific third-party integrations are considered "Dealbreakers" if removed
- The level of frustration developers face when using the client's API
- Whether the client's "Walled Garden" strategy is actively driving users to open-source competitors
- The perceived quality and safety of third-party apps in the client's marketplace

**Cannot answer:**
- How intuitive the core proprietary UI is (requires Usability & UX)
- Whether the core product itself is useful without any integrations (requires Software Experience)

# Section 3: Brief Interrogation Guide
**The Target Demographic:**
- Are we interviewing "End Users" (who just want two apps to sync) or "Developers/Partners" (who are building the integrations)? The AI must definitively branch the brief here, as these audiences speak entirely different languages.

**The Ecosystem Perimeter:**
- Which specific integrations or API endpoints are under review? The brief must prevent the research from turning into a general technology audit of the client's company.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If developers state that your API documentation is completely outdated and unusable, will you allocate engineering headcount to fix it this quarter?
- If end-users reveal they only use your platform because it connects to [Competitor X], will you attempt to build your own version of [Competitor X], or lean into the partnership?

**Well-formed decision map example:**
> Ecosystem outcome: If more than 40% of Shopify merchants state that the lack of a native TikTok Shop integration is hurting their sales, we will accelerate the TikTok app development. If developers rate our API rate-limits as "hostile," we will double the free-tier limit to prevent them migrating to Stripe.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| The 'Dealbreaker' Integrations | 25% | Root | 0.85 |
| Integration Friction (Setup & Maintenance) | 20% | Root | 0.80 |
| Data Portability & 'Hostage' Sentiment | 20% | Root | 0.85 |
| Marketplace Trust & Discovery | 15% | Root | 0.75 |
| Developer / API Experience (If applicable) | 20% | Root | 0.80 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The "Locked-In" Hostage: The brief must establish if users feel *trapped* in the ecosystem (because their data is stuck there) or if they freely *choose* the ecosystem because it's genuinely the best. Trapped users are a high churn risk the moment a migration tool is invented.

# Section 7: Constitutional Constraints
1. **The 'Black Box' Limit.** If an end-user complains that an integration is broken, the AI must not attempt to troubleshoot the code. It must simply document the impact of the broken integration on the user's business.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| End-User 'Marketplace/App Store' Audit | Low | 15–20 mins |
| Standard Tech-Stack Integration Mapping | Moderate | 20–30 mins |
| Developer API / SDK Technical Interview | High | 35–45 mins |

# Section 9: Handoff Checklist
- [ ] Audience type (End-User vs Developer) defined
- [ ] Specific integrations or API perimeters established
- [ ] 'Walled Garden' vs 'Open System' context documented
- [ ] Decision map outcome actions recorded for the platform strategy team
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Core Utility Failure:** If a user relies on a third-party integration to perform the absolute most basic function of the client's software (because the native feature is terrible), this flags a massive failure in **Digital Product: Software Experience**.

## Inbound bridging nodes
When Platform Ecosystem is added as a secondary domain:
- `BRIDGE-dppe-mipt-migration-cost` (Activated when added to Pricing & Value to calculate if the sheer cost and nightmare of migrating all their integrations is the only thing keeping them from switching to a cheaper competitor)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most critical software application outside of our own that this platform MUST connect to for you to be successful?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-dppe-*` node to establish the structural dependency anchor for the entire interview.
