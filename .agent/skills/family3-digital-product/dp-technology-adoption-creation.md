---
name: Technology Adoption Research (Creation)
description: Briefing agent skill for designing Technology Adoption Research. Guides the Creation agent to extract a complete, validated research brief focusing on the psychological resistance to new paradigms (e.g., AI, VR, Blockchain) and the tipping point for mass-market acceptance.
id: dp-technology-adoption-creation
version: 1.0.0
---

# Section 1: Domain Identity
Technology Adoption Research operates at the "Paradigm" level. While 'Adoption & Feature Testing' looks at why someone won't use a new button in an app they already own, Technology Adoption looks at why an entire industry refuses to adopt Artificial Intelligence, or why consumers reject Virtual Reality. It measures trust, fear, perceived inevitability, and the psychological "Crossing the Chasm" mechanics required to move a technology from early adopters to the mass market.

# Section 2: Research Objectives This Domain Can and Cannot Answer
**Can answer:**
- The specific fears or trust barriers preventing a user from adopting a new technological paradigm (e.g., "Will this AI steal my data?")
- What specific proof-points a user needs to see before they trust the technology
- Whether the technology is viewed as an inevitable future they must prepare for, or a passing fad
- The perceived "Job Replacement" threat of automation

**Cannot answer:**
- Which exact competitor they will choose once they finally decide to adopt the tech (requires Competitive Landscape)
- The minute usability flaws of the specific interface (requires Usability & UX)

# Section 3: Brief Interrogation Guide
**The Paradigm Definition:**
- What exactly is the technology being evaluated? (The brief must clearly define the boundary. E.g., Are we testing adoption of "Generative AI specifically for copywriting," or "AI broadly in the enterprise"?)

**The Trust Perimeter:**
- What is the primary barrier the client *assumes* is stopping adoption? (e.g., Cost, Security, Complexity, or Lack of Need). The AI must document this assumption so the Conducting agent can test it.

# Section 4: Decision Map Interrogation
**Questions to ask:**
- If research proves that your target audience fundamentally distrusts your AI model with their data, will you build 'Local processing only' options, or double down on marketing your cloud security?
- If the technology is viewed as a "passing fad," will you reposition it to solve a boring, pragmatic problem instead of a visionary one?

**Well-formed decision map example:**
> Paradigm outcome: If the primary blocker to AI adoption is 'Fear of Hallucination/Inaccuracy,' the product team will implement mandatory 'Human-in-the-Loop' review gates before launching the enterprise tier. If the primary blocker is 'Cost,' the pricing team will launch a freemium tier to subsidize the educational curve.

# Section 5: Coverage Model Specification
Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Foundational Trust & Safety | 25% | Root | 0.85 |
| The Comprehension Gap (Complexity) | 20% | Root | 0.80 |
| Perceived Inevitability vs Fad | 20% | Root | 0.80 |
| The Threat Axis (Job/Status Replacement) | 20% | Root | 0.85 |
| The Tipping Point (What would make them switch) | 15% | Root | 0.75 |

# Section 6: Audience Model Interrogation Guide
**Psychographic dimensions:**
- The Laggard vs Innovator Spectrum: The brief must establish where the target audience sits on the classic technology adoption curve. Interviewing 'Innovators' about why they love new tech yields useless data for figuring out why 'Late Majority' users are terrified of it.

# Section 7: Constitutional Constraints
1. **The 'Evangelism' Ban.** The AI must explicitly instruct the Conducting agent to never attempt to convince a skeptical user that the new technology is good or inevitable. The user's skepticism is the data; fixing the skepticism ruins the data.

# Section 8: Duration Calibration Guide
| Study Focus | Complexity | Minimum Session Duration |
|-------------|------------|--------------------------|
| Consumer 'Fad vs Future' Check | Low | 15–20 mins |
| B2B Trust & Security Audit | Moderate | 20–30 mins |
| Deep Psychological 'Threat' Analysis | High | 30–45 mins |

# Section 9: Handoff Checklist
- [ ] Technology paradigm explicitly bounded
- [ ] Client's primary assumed barrier documented
- [ ] Target audience placement on the Adoption Curve defined
- [ ] Decision map outcome actions recorded for product positioning
- [ ] Session duration calibrated appropriately
- [ ] Coverage model version number recorded (1.0.0)

# Section 10 — Cross-Domain Signals
## Outbound signals
- **Micro-usability masquerading as macro-rejection:** If the user loves the *technology* but says "I just don't use it because the login screen is broken," this flags **Digital Product: Usability & UX**.

## Inbound bridging nodes
When Technology Adoption is added as a secondary domain:
- `BRIDGE-dpta-mibr-brand-trust` (Activated when added to Brand Perception to see if the client's brand is strong enough to convince terrified users to try a scary new technology)

# Section 11 — Supplementary Brief Questions
**The single required supplementary question:**
"What is the single most common objection your sales team or customer support team hears when pitching this new technology paradigm?"

**Initialization mandate:**
The answer populates parameters required by the `BRIDGE-dpta-*` node to anticipate the primary defensive reflex of the respondents.
