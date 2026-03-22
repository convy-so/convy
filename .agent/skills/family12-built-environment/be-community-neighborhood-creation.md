---
name: community-neighborhood-creation
description: Use when designing community/neighborhood research. Audits "Subjective Quality of Place."
id: be-community-neighborhood-creation
version: 1.1.0
---

## Identity
Domain investigation of the "Lived Experience of Place." Audits the intersection of **Physical Realm** (Infrastructure), **Social Realm** (Cohesion), and **Service Realm** (Amenities). Focus: Subjective quality — how it feels to walk home, know neighbors, and carry the area's reputation.

## Absolute Rules
- REQUIRE "Neighborhood Definition." Scope must be geographic and communal (Naming Riverside vs. District).
- ENFORCE "Entity Relationship Audit." If the client is the landlord/authority, trust dynamics MUST be recorded.
- DOCUMENT "Resident Stake." Tenure split (Owners vs. Social Tenants) is mandatory for weighting.
- PIERCE "Marketing Language." The brief must define the "Known Issues" (ASB, closures, local friction).
- DEFINE "Actionable Decision." Brief must distinguish what the client can fix vs. what needs outside actors.

## Research Capabilities
| Can Answer | Cannot Answer |
|---|---|
| Emotional topography (Safe vs. Exposed) | Interior dwelling quality (Residential Domain) |
| Social fabric quality (Community vs. Strangers) | City-wide policy performance (Civic Domain) |
| Service accessibility & gaps | Property valuation / Infrastructure audits |
| Reputational impact on pride/shame | Visitor/Commuter experience (Residents only) |

## Interrogation Guide
| Topic | Requirement | Probe / Target |
|---|---|---|
| Scope | BLOCKING | "What geographic area do residents typically mean? |
| Relationship | BLOCKING | "Do residents know you as their landlord/authority? |
| Tenure | REQUIRED | "Approximate split: Owner vs. Private Rent vs. Social. |
| Issues | REQUIRED | "Informal complaints, community center closures, ASB? |
| Physical Change | ADVISORY | "Specific developments or closures in the last 3 years? |

## Coverage Model Specifications (v1.1.0)
| Node | Weight | Threshold | Description |
|---|---|---|---|
| CN-01 | 15% | 0.70 | Sense of Place (Aesthetic vs. Emotional character). |
| CN-02 | 20% | 0.70 | **CRITICAL.** Social Cohesion (Neighbor quality & belonging). |
| CN-03 | 15% | 0.65 | Local Services (Essential gaps & community spaces). |
| CN-04 | 20% | 0.75 | **CRITICAL.** Safety (Daytime vs. Night alertness/routes). |
| CN-05 | 10% | 0.60 | Walkability (Physical design features aiding movement). |
| CN-06 | 10% | 0.65 | Pride/Identity (Reputation disclaimer/representation). |
| CN-07 | 10% | 0.65 | Future (Anchors or threats to staying 5+ years). |

## Decision Map
| Finding | Scenario | Action |
|---|---|---|
| Positive | Strong cohesion / Physical barriers. | Proceed with community hub investment. |
| Negative | Low safety perception / fragmentation. | Lighting audit / Engagement with local authority. |
| Mixed | Contextual drift (New vs. Old residents).| Design specific integration programs. |

## Constitutional Constraints
- **B-1 (Authority Awareness):** Relationship must be assessed. Landlord-led research carries deference flags.
- **B-2 (Actionable Scenarios):** Brief must contain at least one outcome within the client's direct power.
- **A-1 (Change Filter):** Planned construction/closures must be recorded in `expertState`.

## Calibration & Handoff
| Focus Type | Duration | Notes |
|---|---|---|
| Single Dimension | 15 mins | Max 4 active nodes. |
| Full Experience | 25 mins | All critical nodes active. |
| Longitudinal | 30 mins | Before/After change focus. |

**Handoff Data:**
- `brief.neighborhoodScope`
- `brief.entityRelationship`
- `brief.tenureSplit`
- `brief.knownTriggerEvents`