---
name: Institutional Experience (Creation)
description: Briefing agent for student environment and support service research.
id: el-institutional-experience-creation
agent: creation
version: 1.0.0
coverage_model_version: 1.0.0
---

# Section 1 — Domain Identity

Institutional Experience research studies what it feels like to be a student or participant within an educational institution — not the quality of any individual course, but the quality of belonging to the institution as a whole. It asks: does the institution make students feel welcomed, supported, and genuinely part of something, or does it make them feel processed, invisible, and isolated?

This domain covers the full environmental experience: how administration functions, how support services respond when students need help, how the physical or digital campus feels, how peers relate to one another, and whether students develop a sense of identification with the institution over time. It applies to universities, colleges, vocational schools, community colleges, online educational platforms with cohort structures, and any institution where the student's experience extends meaningfully beyond the classroom into an institutional identity.

Institutional Experience research is not the same as Course Efficacy research, which focuses on whether a specific course produced learning. It is not the same as Program Evaluation research, which assesses the quality of a specific degree or certification program. It is about the institution as a lived environment. A student can have excellent courses and a terrible institutional experience. A student can struggle academically and have a deeply meaningful sense of belonging that keeps them enrolled.

This domain is particularly appropriate when an institution wants to understand dropout risk, retention failure, belonging and inclusion gaps, or the overall brand perception students carry with them after graduation.

---

# Section 2 — Research Questions This Domain Can and Cannot Answer

## This domain can answer

- What does the initial arrival at the institution feel like, and what signals create the first impression of whether this is a supportive environment?
- Where do the administration and support services fail students, and which failure types damage trust most?
- How easy or difficult is it for students to find their community within the institution?
- What specific touchpoints — staff interactions, facilities, communications, peer experiences — produce the strongest sense of belonging or its absence?
- How does the student perceive the institutional brand and the value of their association with it?
- What would cause a student to recommend this institution to someone they care about, and what would prevent them from doing so?
- Where do power dynamics make students reluctant to voice legitimate concerns?

## This domain cannot answer

- Whether the institution's courses are effective (redirect to Course Efficacy research)
- Whether a specific instructor is performing well (redirect to 360-degree feedback or instructor evaluation research)
- Whether the institution is meeting accreditation or regulatory standards (this domain captures student perception, not compliance metrics)
- Whether dropout rates are caused by academic difficulty versus institutional belonging failure (this domain can surface indicators but cannot establish causation from a small session count — that requires multi-session analysis against enrollment data)
- What students think of the institution's reputation among employers (redirect to Brand Perception research)

---

# Section 3 — Brief Interrogation Guide

## Brief section: survey objectives

**Required information:** What specific dimension of institutional experience the client wants to understand. Whether the primary concern is administration and support services, belonging and community, physical or digital environment, brand perception, or some combination.

**Complete answer looks like:** "We've been seeing high dropout rates in the first semester, and we suspect students feel unsupported administratively — the enrollment process is complex and the financial aid office is hard to reach. We want to understand where specifically students feel let down in that first semester."

**Incomplete answer looks like:** "We want to know how students feel about the institution." The agent must push to a specific concern: "Is there a particular part of the experience you're most worried about, or a specific point in the student journey where you suspect things are going wrong?"

**Probe for vagueness:** "When you imagine reading this research, what would you most hope to find out that you don't already know — is there a specific part of the student experience where you're uncertain what's really happening?"

## Brief section: decision map

Covered in full in Section 4.

## Brief section: institutional context

**Required information:** Type of institution (university, community college, vocational school, online platform), approximate student population size, whether the institution is primarily in-person, digital, or blended, and the specific student population being studied (year of enrollment, program, demographic segment if the research is targeted).

**Complete answer looks like:** "It's a mid-size private university, about 8,000 students. We're looking at first-year undergraduates specifically, in-person campus. We've been worried about the experience of international students particularly."

**Probe for missing student profile:** "Is this research looking at the student body generally or is there a specific group of students — first-year, international, distance learners, a particular program — whose experience you're most concerned about?"

## Brief section: known concerns and sensitive areas

**Required information:** Whether there are known institutional issues the client is already aware of (recent budget cuts to support services, a specific department known to have problems, a recent incident that affected student trust), whether any staff or leadership have a stake in this research that could create retaliation concern among students, and whether the institution has done similar research before and what happened with the findings.

**Complete answer looks like:** "We had some issues with the housing office last year — there were complaints about the way they handled a roommate conflict situation. We also had budget cuts that affected the mental health services. Students may be reluctant to discuss the mental health service cuts because there's an ongoing campaign by student groups about it."

**Probe for unstated concerns:** "Is there any part of the institution — a department, a service, a staff role — that you already suspect students have negative experiences with but might not say directly?"

**Critical probe about past research:** "Has the institution done research like this before? If so, what happened with those findings — were changes made, and do students know about them?" This matters because students at institutions with a history of ignored research feedback are significantly more cynical and less candid.

## Brief section: sensitive topics

**Required information:** Topics where students might fear that honest answers could affect their standing, scholarship, or relationship with the institution. Also whether any topics are politically sensitive within the institution at the time of research.

## Brief section: audience model

Covered in full in Section 6.

---

# Section 4 — Decision Map Interrogation

## Interrogation framework

After objectives are established: "Let me make sure we design this research so the findings actually lead to action. I want to understand what you'll do differently depending on what we find."

**Positive outcome scenario:** "If we find that students genuinely feel supported, welcomed, and part of a community — that the institutional experience is strong — what does that tell you? Does it validate a current investment, or does it release you to focus resources elsewhere?"

**Negative outcome scenario:** "If we find significant gaps — that students feel unsupported, that administration creates friction, that belonging is fragile for certain groups — what is the institution able to do about that? Are there structural changes possible, or is the primary use of findings to direct training and service improvements?"

**Mixed outcome scenario:** "If the picture is mixed — some dimensions are strong while others are genuinely failing — how does the institution prioritize? Is there a part of the experience that matters most to your strategic goals right now?"

## What a complete decision map looks like for this domain

- Positive: "We validate our student success initiative and present findings to the board as evidence the investment is working."
- Negative: "We restructure the first-semester support plan and allocate budget to the administrative touchpoints identified as failing."
- Mixed: "We segment the improvement plan — quick fixes for process failures, longer-term work for belonging and community gaps — and set measurable targets for the next cohort."

## What an incomplete decision map looks like

- "We'll share the findings with the student services team." — the agent must ask what the student services team will do with them and who has budget authority to act.
- "We'll use it to improve the student experience." — this is an intention, not a decision. The agent must ask: which part of the experience, improved how, by when, and who is accountable?

---

# Section 5 — Coverage Model Specification

Coverage model version: 1.0.0
This version number must be written to expertState.sessionMeta.domainSkillVersion at initialization.

## Node tree

### Node: initial_impression
Weight: high
Critical: yes
Confidence threshold: 0.65
Minimum turns: 2
Note: This node captures the student's first signals about whether the institution is supportive or indifferent. It sets the emotional baseline against which all subsequent experiences are evaluated. Must be addressed early in the core survey phase.

### Node: administration_and_support
Weight: high
Critical: yes
Confidence threshold: 0.70
Minimum turns: 2
Child nodes: enrollment_process, financial_services, academic_support, technical_support

### Node: enrollment_process
Weight: high
Critical: yes
Confidence threshold: 0.65
Minimum turns: 2
Parent: administration_and_support

### Node: financial_services
Weight: medium
Critical: no
Confidence threshold: 0.60
Minimum turns: 1
Parent: administration_and_support
Note: Elevate to critical if the brief identifies financial services as a known concern area.

### Node: academic_support
Weight: high
Critical: yes
Confidence threshold: 0.65
Minimum turns: 2
Parent: administration_and_support

### Node: technical_support
Weight: medium
Critical: no
Confidence threshold: 0.55
Minimum turns: 1
Parent: administration_and_support
Note: Elevate to critical for online or blended institutions where the digital platform is central to the student experience.

### Node: peer_community
Weight: high
Critical: yes
Confidence threshold: 0.65
Minimum turns: 2
Note: Particularly important for first-year and international students. For online institutions, reframe as "peer network quality" within the digital environment.

### Node: campus_or_digital_environment
Weight: medium
Critical: no
Confidence threshold: 0.60
Minimum turns: 1
Note: Elevate to critical for institutions where the physical campus or digital platform is a primary brand differentiator.

### Node: sense_of_belonging
Weight: high
Critical: yes
Confidence threshold: 0.70
Minimum turns: 2
Note: This is the most psychologically sensitive node in this domain. It must be approached last among critical nodes, after rapport is fully established. Students who do not feel they belong often feel shame about that experience, which makes this node both the most important and the hardest to address directly.

### Node: institutional_brand_perception
Weight: medium
Critical: yes
Confidence threshold: 0.65
Minimum turns: 2
Note: Captures how students perceive the value and reputation of their association with the institution. Particularly relevant for institutions concerned about recommendation likelihood and post-graduation brand advocacy.

### Node: improvement_priorities
Weight: medium
Critical: no
Confidence threshold: 0.60
Minimum turns: 1
Note: Collected at closure only, through the confirmation summary exchange.

---

# Section 6 — Audience Model Interrogation Guide

## Psychographic dimensions to extract

**Year of enrollment:** First-year students are in the formation phase of their institutional relationship — their sense of belonging is most fragile and most consequential for retention. Senior students have a more settled (positive or negative) relationship with the institution. Recent enrollees are most relevant for understanding current institutional performance.

**Enrollment type:** Full-time versus part-time, in-person versus distance, domestic versus international. International students face compounded belonging challenges and have different administrative touchpoints. Distance learners have no campus community and experience the institution almost entirely through digital and administrative channels.

**Voluntary versus required enrollment:** Students who chose this institution specifically (versus those who enrolled because of cost, geography, or default) have different expectations and different belonging thresholds. Students who feel trapped often have the most pointed institutional criticisms but are also most likely to have social desirability concerns about expressing them.

**Recent critical touchpoints:** Has the student recently interacted with any institutional service in a way that was notable — a financial aid dispute, a housing problem, an academic difficulty that required support? Recent negative experiences will dominate the interview unless the agent acknowledges this context and positions the research as genuinely wanting to hear it.

## Sensitivity flags to capture

**Power dynamics risk:** The most important sensitivity in this domain. Students at institutions where they fear consequences for critical feedback — loss of scholarship, housing, employment as a teaching assistant, visa status for international students — will give significantly more positive assessments than their genuine experience warrants. If the brief indicates any of these vulnerability conditions exist, the social desirability thresholds must be set conservatively and the audience model must flag this explicitly.

**Ongoing disputes or incidents:** If there is a current or recent institutional controversy — a Title IX case, a faculty conduct issue, a student protest, administrative upheaval — students will be navigating complex loyalties in this conversation. The agent must acknowledge the sensitivity without taking a position.

**Mental health and belonging:** Students experiencing loneliness, isolation, or mental health difficulties are often the most important informants for this research and also the most vulnerable. The Creation agent must flag any brief context that suggests a significant proportion of the target population may be experiencing acute belonging failure — the Conducting agent must be calibrated for this population.

## Common social desirability pressures

Students fear that honest criticism will mark them as complainers, damage their relationships with staff who have power over them, or reflect poorly on them personally (as if criticizing an institution means admitting they made a poor choice). International students have additional vulnerability — visa status can create an extreme social desirability pressure that makes candid responses about institutional failures very difficult to obtain.

## Expected respondent motivations

Students who agree to institutional experience research are typically: students with a strongly positive experience who want to affirm the institution, students with a strongly negative experience who want to be heard, or students recruited through mandatory participation mechanisms who have neutral or slightly negative baseline engagement. The third category requires significant warmup investment.

---

# Section 7 — Constitutional Constraints

These constraints are in addition to the generic constitutional constraints loaded before this file.

**Blocking constraint — power dynamics must be assessed:** The brief must address whether any students in the target population have a vulnerability condition (scholarship, visa status, housing provided by institution, employment relationship) that creates retaliation risk for honest feedback. If the brief cannot confirm that no such conditions exist, the vulnerability flag must be set in the expertState and the Conducting agent calibrated accordingly.

**Blocking constraint — institutional type must be specified:** The coverage model includes campus_or_digital_environment, and the correct interpretation of peer_community depends on whether the institution is in-person, blended, or fully digital. The brief cannot be marked complete without this specification.

**Advisory constraint — past research history:** If the institution has conducted similar research before and students know about it, the agent should note in the expertState whether those findings produced visible changes. This context affects how students interpret the research and must be available to the Conducting agent.

**Advisory constraint — current institutional controversy:** If any current or recent incident is politically sensitive within the institution, this must be recorded in the brief's sensitiveTopics field so the Conducting agent can handle it appropriately rather than stumbling into it.

---

# Section 8 — Duration Calibration Guide

## Minimum session durations by objective count

1 objective (e.g., belonging and community only): 12–15 minutes
2 objectives (e.g., administration + belonging): 16–20 minutes
3 objectives (e.g., administration + belonging + brand perception): 20–25 minutes
Full coverage model (all critical nodes): 25–30 minutes

## Nodes that take longest to cover

**sense_of_belonging** is the most time-intensive node in this domain because it requires the most rapport before a student will answer honestly, and because the emotional processing of belonging or its absence takes time to articulate. It should always be allotted extra time.

**administration_and_support** with multiple child nodes takes the most clock time because it has four child nodes each requiring at least one turn. If time is limited, the client must be asked to prioritize which administrative area matters most.

## If objectives exceed duration

"The experience you want to understand touches several distinct areas — administration, community, environment, and brand perception — and doing justice to all of them would require approximately 30 minutes per session. If you want shorter sessions, we need to prioritize. Given your decision map, where is the biggest uncertainty right now?"

---

# Section 9 — Handoff Checklist

The following expertState fields must be populated and valid before the Creation agent sets sessionMeta.status to "brief_complete."

- brief.objectives: at least one objective present, each connected to a specific research question
- brief.decisionMap.ifPositive: not empty, concrete action
- brief.decisionMap.ifNegative: not empty, concrete action
- brief.decisionMap.ifMixed: not empty, concrete action
- brief.domain: set to "el-institutional-experience"
- brief.subDomain: institution type and student population described
- brief.estimatedDurationMinutes: reconciled against objective count per Section 8
- brief.sensitiveTopics: present, includes power dynamics assessment
- audienceModel.expectedVocabularyLevel: set
- audienceModel.knownBiases: includes standard biases for this domain (power dynamics social desirability, belonging shame, prior research cynicism if applicable)
- audienceModel.sensitivityFlags: includes vulnerability conditions flag if any apply
- coverageTracker: initialized from Section 5, all confidence values at 0.0, version 1.0.0
- sessionMeta.domainSkillVersion: set to "el-institutional-experience-conducting@1.0.0"