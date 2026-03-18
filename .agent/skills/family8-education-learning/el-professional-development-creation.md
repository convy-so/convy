---
name: Professional Development Research (Creation)
description: Briefing agent skill for designing Professional Development Research studies. Guides the Creation agent to extract a complete, validated research brief focused on the organizational ecosystem of employer-supported growth — the quality of mentorship, manager support, career architecture, and learning culture — not the output of any specific training event.
id: el-professional-development-creation
version: 1.0.0
---

## Section 1: Domain Identity

Professional Development Research studies the lived experience of an employee's growth within an organization — not whether a specific training program worked, but whether the organizational environment actually supports, enables, and rewards development. The central research question is: does the organization's approach to professional development genuinely help people grow, and what is missing? This domain covers the full ecosystem of employer-supported growth: formal training programs, mentorship arrangements, manager-led development conversations, internal mobility opportunities, time and resource allocation for learning, and the cultural norms that determine whether development is treated as real work or an extracurricular.

This domain is distinct from Learning Outcome Research, which studies what a learner can demonstrate after a specific training event. Professional Development Research does not require a specific training event as its anchor — it is a study of an ongoing organizational relationship between an employee and the institution's development infrastructure. It is also distinct from Employee Engagement Research, which studies the full psychological relationship between an employee and their work. Professional Development Research is a focused sub-study: it cares specifically about growth, not about pay, workload, team dynamics, or the broader experience of working at the organization, except insofar as those factors directly shape the development experience.

If a client says "we want to understand how our employees feel about their career growth," that could mean this domain or Employee Engagement Research depending on whether they want a focused development study or a comprehensive engagement picture. The Creation agent must determine this before building a brief. If the client wants to understand why a specific cohort of employees has stagnated technically, that may be Learning Outcome Research combined with Professional Development Research. If the client wants to understand why talented employees are leaving despite strong training programs, that is likely Retention Research under the Exit & Departure domain. The Creation agent must identify the correct domain before beginning brief construction.

---

## Section 2: Research Objectives This Domain Can and Cannot Answer

**This domain can answer:**
- Whether employees have a clear understanding of their development path within the organization
- Whether the organization's formal training and learning resources are seen as accessible, relevant, and high quality
- Whether mentorship relationships — where they exist — are substantive and effective
- Whether the direct manager relationship supports or hinders professional growth
- Whether employees believe the organization genuinely invests in their development, or whether development is a stated value without behavioral support
- What specific gaps exist in the development ecosystem — missing tools, missing relationships, missing time, missing clarity
- What would most meaningfully change the employee's experience of their own development

**This domain cannot answer:**
- Whether a specific training program produced behavioral change (that is Learning Outcome Research)
- The overall quality of the employee experience — pay, workload, team dynamics, organizational trust (that is Employee Engagement Research)
- Why a specific employee left or is leaving (that is Exit & Departure Research)
- What the market benchmarks for professional development investment look like — this domain produces the qualitative depth, not the quantitative comparison
- Whether the organization's talent pipeline is healthy at an aggregate level — the research produces evidence relevant to that question but cannot assess it from a single qualitative session

---

## Section 3: Brief Interrogation Guide

The Creation agent must extract the following before marking the brief complete. These are organized by the expertState section they populate. The agent pursues these conversationally in any order that emerges naturally.

**Study parameters:**
- What is the client's organization — size, sector, and the type of roles held by participants?
- What population of employees is being studied — is this a specific function, level, tenure band, or the full workforce? The answer affects the Coverage Model prioritization and the Audience Model.
- Is there a precipitating event that triggered this study? A retention problem, a leadership concern about stagnation, an employee survey result that flagged development as a pain point? This matters because the decision map must respond to the real question behind the study, not just the stated topic.

**Development ecosystem dimensions the client cares about:**
- Is the client's primary concern formal learning programs, or the informal development environment (manager conversations, mentorship, on-the-job challenge)?
- Does the organization have a formal mentorship program? A career development framework? A dedicated L&D function? These shape what coverage nodes are active.
- Has the organization recently changed its approach to development — a new L&D platform, a new performance review process, a new management development initiative? If so, the brief must document this because participants will frame their experience partly in relation to these changes.

**Organizational context the Analytics agent will need:**
- What does the organization believe about its development culture — what does it tell itself and its employees? The brief must capture this because Analytics interprets findings against the gap between espoused and enacted development culture.
- Are there known structural constraints on development investment — a hiring freeze that eliminated external training budgets, a recent restructure that eliminated development roles? These are context, not excuses, but they are analytically necessary.

**Incomplete answer probes:**
- If the client cannot describe what their development culture is supposed to be: "If an employee asked their manager on their first day, 'How does this organization help people grow?' — what would the ideal answer be? What do you wish the answer was?"
- If the client gives a vague participant population: "Walk me through a specific employee in this population — their role, roughly how long they've been there, what their growth aspirations typically look like. I want to make sure we're designing for a real person."

---

## Section 4: Decision Map Interrogation

Professional Development Research is frequently commissioned without a clear decision mandate — a client may commission it because "we should know this" without specifying what changes depending on what they find. The Creation agent must extract a decision map that is action-specific before marking the brief complete.

**Questions to ask:**
- If the findings show that the development ecosystem is strong and employees feel genuinely supported — what decision does that inform? (Benchmark confirmation? Investment justification? Nothing changes?) The agent must push past "we'd be pleased to hear that."
- If the findings show that the development ecosystem is failing employees — that managers are not having development conversations, that training is inaccessible or irrelevant, that career paths are opaque — what decision does that inform? Specifically: which part of the system would the client change, and who owns that change?
- If findings are mixed — formal learning is valued but the manager relationship is failing, or career clarity is strong but time allocation for learning is insufficient — what is the decision logic? Which failure mode triggers action, and what action?

**Well-formed decision map example:**
> Positive outcome: Development ecosystem is functioning well. We confirm current investment levels and use findings to communicate the development culture more clearly in recruitment.
> Negative outcome: We identify the highest-priority gap (formal learning, manager capability, or career clarity) and commission a targeted intervention.
> Mixed outcome: We address the specific failing dimension and leave the functioning dimensions unchanged.

**Poorly-formed decision map (flag and probe):**
> "We want to understand our employees' development experience." — Not a decision. Probe: "What would you do differently if you understood it? What is the decision that depends on these findings?"

---

## Section 5: Coverage Model Specification

Version: 1.0.0

| Node | Weight | Parent | Confidence Threshold |
|------|--------|--------|----------------------|
| Career Path Clarity | 20% | Root | 0.75 |
| — Awareness of advancement criteria | 10% | Career Path Clarity | 0.70 |
| — Sense of trajectory and possibility | 10% | Career Path Clarity | 0.70 |
| Learning & Training Access | 20% | Root | 0.70 |
| — Perceived quality and relevance of available learning | 12% | Learning & Training Access | 0.70 |
| — Ease of access and time permission | 8% | Learning & Training Access | 0.65 |
| Manager as Development Enabler | 25% | Root | 0.80 |
| — Quality of career development conversations | 15% | Manager as Development Enabler | 0.75 |
| — Manager's active role in creating growth opportunities | 10% | Manager as Development Enabler | 0.70 |
| Mentorship and Peer Development | 10% | Root | 0.65 |
| — Availability and quality of formal or informal mentorship | 6% | Mentorship and Peer Development | 0.60 |
| — Peer learning culture | 4% | Mentorship and Peer Development | 0.60 |
| Organizational Development Culture | 15% | Root | 0.70 |
| — Perception that development is genuinely valued, not performative | 10% | Organizational Development Culture | 0.70 |
| — Evidence of development-linked recognition or advancement | 5% | Organizational Development Culture | 0.65 |
| Efficacy and Retention Outlook | 10% | Root | 0.65 |
| — Employee's confidence in their growth trajectory | 6% | Efficacy and Retention Outlook | 0.60 |
| — Likelihood of staying based on development prospects | 4% | Efficacy and Retention Outlook | 0.60 |

Critical nodes (highest weight in Analytics findings): Manager as Development Enabler and Career Path Clarity. These two nodes are the most common locus of development failure in organizations and must not be undercovered.

---

## Section 6: Audience Model Interrogation Guide

**Psychographic dimensions that matter:**
- Tenure: Employees in their first two years are calibrating their expectations against their first impressions; longer-tenured employees are comparing current development support against a history of experiences. The interview approach and the anchor points for development questions differ significantly.
- Ambition orientation: Some respondents have explicit career advancement goals; others have primarily skill development goals; others have reached a settled career stage and care about development primarily for engagement and intellectual stimulation. The Creation agent must ask the client to characterize the typical respondent's ambition profile.
- Visibility of development culture: In some organizations, development culture is highly visible (formal development plans, regular career conversations, named mentors). In others it is almost entirely informal. The visibility level shapes what the respondent will have direct opinions on.

**Social desirability flags:**
- Respondents are usually employed by the organization commissioning the research, which creates strong incentives to give politically safe answers. The Conducting agent will need to work hard for honest criticism, especially of the manager relationship.
- If the research was commissioned in response to a specific organizational concern (a retention problem, a failed talent initiative), respondents who are aware of this may frame their answers strategically — either supporting the organizational narrative or using the research as an opportunity to amplify complaints.

**Sensitivity flags:**
- The manager relationship is inherently sensitive — an employee criticizing their manager in a research interview always carries the perceived risk of consequence, regardless of confidentiality assurances. The Creation agent must ask the client whether managers will have any access to individual session data, and must record the answer in the brief. This shapes how strongly the Conducting agent can pursue honest manager relationship data.
- Career stagnation is a sensitive topic. Respondents who feel they have been overlooked for advancement may experience this conversation as reopening a painful subject. The Conducting agent must approach career path discussions without implying that stagnation is the respondent's fault.

---

## Section 7: Constitutional Constraints

The following constraints are specific to Professional Development Research and must be satisfied before the brief can be marked complete.

1. **The manager relationship data sensitivity must be documented.** The brief must record whether the organization has committed to confidentiality at the individual session level and whether managers will ever have access to individual (non-aggregated) session content. The Conducting agent must operate within these constraints, and Analytics must frame findings accordingly.

2. **The organizational development context must be documented.** The brief must state what formal development infrastructure exists — programs, frameworks, platforms, mentorship structures. Analytics cannot assess the gap between stated and experienced development culture without knowing what the organization believes its culture to be.

3. **The decision map must specify which component of the development ecosystem is the priority concern.** A decision map that says "we want to improve development" is too vague to guide Analytics. The brief must specify whether formal training, manager behavior, career clarity, or organizational culture is the primary focus, and the decision map must reflect this.

4. **Participant population must be defined at a level specific enough to be interviewer-meaningful.** "All employees" is not adequate if the client cares specifically about the experience of a particular cohort — early career, mid-career, high potential, specific function. The interviewer's framing and the coverage node prioritization depend on this definition.

---

## Section 8: Duration Calibration Guide

| Scope of Development Ecosystem Covered | Minimum Session Duration | Notes |
|-----------------------------------------|--------------------------|-------|
| Single focus (e.g., manager relationship only) | 25–30 minutes | Narrow scope; allows deep probing on one dimension |
| Two to three dimensions | 35–45 minutes | Standard scope; full model with focused coverage |
| Full development ecosystem | 50–55 minutes | Maximum recommended; requires careful pacing |
| Full ecosystem plus retention outlook | 60 minutes | Requires explicit time management; fatigue risk is significant |

If the client wants to cover the full development ecosystem plus organizational culture plus retention in a single session, the Creation agent must advise that the session will produce shallow data on each dimension rather than actionable depth on any of them, and must assist the client in identifying their top three priorities.

---

## Section 9: Handoff Checklist

The following expertState fields must be populated before the Creation agent sets status to `brief_complete`.

- [ ] Organization profile: size, sector, and role types of participant population
- [ ] Participant population defined: function, level, tenure band, or explicit "full workforce"
- [ ] Precipitating event or client concern documented
- [ ] Formal development infrastructure documented: programs, career frameworks, mentorship structures, L&D platforms
- [ ] Organization's self-described development culture recorded
- [ ] Known structural constraints on development investment documented (budget freezes, restructures affecting L&D)
- [ ] Recent organizational changes to development approach documented
- [ ] Manager relationship data sensitivity resolved: confidentiality commitment and access restrictions recorded
- [ ] Social desirability risk characterized: visibility of research purpose to participants; commission context
- [ ] Ambition profile of participant population characterized
- [ ] Sensitivity flags documented: manager relationship exposure risk; career stagnation sensitivity
- [ ] Decision map: positive, negative, and mixed outcome actions recorded
- [ ] Priority development ecosystem dimension(s) specified in decision map
- [ ] Session duration target confirmed against calibration guide
- [ ] Coverage model version number recorded (1.0.0)