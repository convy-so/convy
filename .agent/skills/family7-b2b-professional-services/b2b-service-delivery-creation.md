---
name: B2B Service Delivery Research (Creation)
description: Briefing agent skill for designing B2B Service Delivery Research. Guides the Creation agent to extract a complete, validated research brief focusing on implementation friction, SLA adherence, and the 'Time-to-Value' gap in enterprise services.
id: b2b-service-delivery-creation
version: 1.0.0
---

# Section 1: Domain Identity
B2B Service Delivery Research evaluates the gap between "The Sales Pitch" and "The Reality." In B2B, buying the product is only 10% of the battle; the other 90% is implementing it, migrating data, training staff, and relying on the vendor's professional services team. This domain isolates the friction in onboarding, the competence of the Customer Success Managers (CSMs), and whether the client is actually achieving the ROI they were promised during the sales cycle.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- Why the onboarding/implementation process took twice as long as promised
- Whether the client's CSM is viewed as a strategic advisor or just a glorified support ticket router
- The specific moments where the client felt abandoned after the contract was signed
- If the 'Time-to-Value' (TTV) expectation set by Sales was met

**Cannot answer:**
- Why the client chose this vendor over a competitor originally (requires Buying Process)
- How to redesign the actual buttons in the software (requires Usability & UX)

# Section 3: Brief Interrogation Guide
**The TTV Baseline:**
- What specific "Time-to-Value" did Sales promise this cohort? (e.g., "Deployed in 30 days"). The AI must anchor the research against this specific promise.

**The Service Model:**
- Is this cohort receiving "White Glove/Enterprise" support (dedicated CSM) or "Tech-Touch/SMB" support (automated emails)? The AI must establish the support tier, as expectations scale with the price tag.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If clients state that onboarding is too painful, will you allocate engineering resources to build automated migration tools, or just hire more onboarding specialists?
- If the CSMs are viewed purely as reactive support, will you change their KPI from "Tickets Closed" to "Quarterly Business Reviews Completed"?

**Well-formed decision map example:**
> Delivery outcome: If the primary driver of churn is 'Slow Implementation,' the operations team will mandate that Sales can no longer promise 30-day deployments for complex environments. If the CSMs are highly rated but the product is still failing, we will separate the Customer Success (Relationship) and Technical Account Manager (Technical Support) roles.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Implementation & Onboarding Friction | 25% | Root | 0.85 |
| The Sales vs Reality Gap | 20% | Root | 0.85 |
| Customer Success/Account Mgmt Quality| 20% | Root | 0.80 |
| SLA Adherence & Technical Support | 15% | Root | 0.75 |
| Value Realization (Did it work?) | 20% | Root | 0.85 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Executive Sponsor vs The Admin: The brief must establish if we are interviewing the Executive who bought the service (who cares about high-level ROI) or the System Admin who actually has to integrate it (who cares about exact API response times and support ticket resolution speed).

# Section 7: Constitutional Constraints
1. **The 'Individual Contributor' Shield.** The AI must never validate a client's request to have a specific support employee fired. It must redirect personal attacks against a CSM into structural feedback about the support process.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| 30-Day Post-Onboarding Check-In | Low | 15–20 mins |
| Annual Exec Business Review Prep | Moderate | 25–35 mins |
| Deep-Dive Enterprise Implementation Autopsy| High | 40–50 mins |

# Section 9: Handoff Checklist
- [ ] Support tier established (White Glove vs Tech-Touch)
- [ ] Sales promise / Expected TTV documented
- [ ] Target persona (Executive vs Admin) defined
- [ ] Decision map outcome actions recorded for Customer Success Leadership
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Procurement nightmare:** If the client spends the entire interview raging about how terrible the legal contract process was, this requires **B2B: Buying Process**.

## Inbound bridging nodes
When B2B Service Delivery is added as a secondary domain:
- `BRIDGE-b2bs-mipt-churn-threat` (Activated when added to Pricing & Value to determine if they are demanding a massive discount purely as an apology for a terrible onboarding experience)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most common reason a support ticket gets escalated to a manager?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-b2bs-*` node to anticipate the primary structural failure of the standard support tier.
