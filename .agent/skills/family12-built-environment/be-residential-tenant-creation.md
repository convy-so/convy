---
name: residential-tenant-creation
description: Use when designing apartment/residential research. Audits "Home vs. Shelter" and "Service Reality."
id: be-residential-tenant-creation
version: 1.1.0
---

## Identity
Domain investigation of the **Internal Building Experience**. Audits the gap between marketed promises and lived reality across **Physical Quality**, **Maintenance Service**, and **Shared Amenities**. Focus: Does the property constitute a "Home" or merely a "Shelter."

## Absolute Rules
- REQUIRE "Management Structure." Must identify if in-house, external, or resident-led.
- ENFORCE "Tenure Calibration." Split between Leasehold, Private Rent, and Social Housing is mandatory.
- DOCUMENT "The Maintenance Gap." Initial brief must define suspected failure points (Ticket volume vs. Satisfaction).
- DEFINE "Actionable Decision." Success must be tied to a specific staff, process, or physical change.
- AUDIT "Amenity Utility." Distinguish between "Marketed Assets" and "Actual Use Patterns."

## Research Capabilities
| Can Answer | Cannot Answer |
|---|---|
| Physical comfort (Noise, Light, Temp) | Neighborhood safety/transport (Community Domain) |
| Maintenance responsiveness & empathy | Regulatory/Compliance audits |
| Amenity utilization & missing value | Market pricing benchmarks (Pricing Domain) |
| Renewal intention & value perception | Employee disciplinary decisions |

## Interrogation Guide
| Topic | Requirement | Probe / Target |
|---|---|---|
| Management | BLOCKING | "In-house team vs. External? Resident association? |
| Tenure | BLOCKING | "Leasehold/Rent/Social? Average tenure length? |
| Issues | REQUIRED | "Maintenance ticket spikes? Complaint patterns? |
| Amenities | REQUIRED | "Gym/Lounge/Terrace? Usage vs. Booking data? |
| Context | REQUIRED | "Imminent rent review? Upcoming maintenance redesign? |

## Coverage Model Specifications (v1.1.0)
| Node | Weight | Threshold | Description |
|---|---|---|---|
| RT-01 | 15% | 0.70 | Arrival (Onboarding & move-in signals). |
| RT-02 | 25% | 0.70 | **CRITICAL.** Physical Quality (Noise isolation / Climate). |
| RT-03 | 30% | 0.75 | **CRITICAL.** Management (Responsiveness & Empathy). |
| RT-04 | 10% | 0.65 | Amenities (Utilization vs. Condition). |
| RT-05 | 10% | 0.65 | Community (Sense of belonging vs. Isolation). |
| RT-06 | 10% | 0.65 | Value (Renewal intention and rent perception). |

## Decision Map
| Finding | Scenario | Action |
|---|---|---|
| Positive | Strong management / High satisfaction. | Justify current staffing model in budget review. |
| Negative | Maintenance friction / Process failure. | Redesign specific touchpoint (e.g., ticket follow-up).|
| Mixed | High quality / Low community. | Redirect amenity budget to resident activation events.|

## Constitutional Constraints
- **B-1 (Direct Action):** Must include at least one bounded process/physical change achievable in 3 months.
- **B-2 (Performance Protection):** Findings must not be used as a direct stick for named individuals.
- **A-1 (Rent Review):** If rent review is imminent, note in `expertState` to filter "Financial Grievance" bias.

## Calibration & Handoff
| Focus Type | Duration | Notes |
|---|---|---|
| Maintenance Only | 14 mins | Max 4 active nodes. |
| Physical Focus | 16 mins | Community nodes optional. |
| Full Experience | 25 mins | All critical nodes active. |

**Handoff Data:**
- `brief.managementType`
- `brief.residentProfile`
- `brief.maintenanceGrievanceLevel`
- `brief.amenitySpec`