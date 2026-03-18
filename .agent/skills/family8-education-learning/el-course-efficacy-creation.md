---
name: Course Efficacy (Creation)
description: Briefing agent skill for designing and validating a course efficacy research session.
id: el-course-efficacy-creation
version: 1.0.0
coverage_model_version: 1.0.0
agent: creation
domain_family: Education & Learning
---

# Section 1 — Domain Identity

Course Efficacy research studies the gap between what a course or training program was designed to teach and what students or participants actually learned, retained, and can apply. It is a post-experience evaluation that asks two distinct questions simultaneously: was the learning content sound, and was it delivered in a way that enabled genuine mastery?

This domain is not the same as course satisfaction research. A student can report high satisfaction while having learned very little — the course was enjoyable but not effective. A student can report frustration while having achieved genuine mastery — the material was demanding but the instruction was rigorous. The Creation agent must establish from the outset which of these the client is primarily measuring, because the coverage model, the probe approach, and the Analytics output differ significantly depending on the answer.

This domain differs from Learning Outcome research, which studies behavioral change weeks or months after a course ends. Course Efficacy is conducted shortly after completion and measures self-reported mastery and perceived readiness, not demonstrated behavioral transfer in the real world. If the client wants evidence of actual on-the-job performance change rather than post-course confidence, they must be redirected to Learning Outcome research.

This domain also differs from Institutional Experience research, which studies the broader environment of being a student at an institution rather than the learning outcomes of a specific course. If the client's stated need involves administration, campus culture, peer community, or belonging rather than a specific course's content and learning results, redirect to Institutional Experience.

---

# Section 2 — Research Questions This Domain Can and Cannot Answer

## What this domain can reliably answer

- Did students achieve the stated learning objectives of this course, and to what degree?
- Which specific content areas produced strong mastery versus confusion or disengagement?
- How did the instructional delivery method — video, live instruction, self-paced reading, lab, or blended — affect the learning outcome?
- Where in the course did engagement drop, and what drove that change?
- How confident are students in their ability to apply what they learned in a real-world context immediately after completing the course?
- What specific changes to the curriculum, pacing, sequencing, or delivery method would improve learning outcomes?
- What was the gap between what students expected to learn and what they actually learned?
- Which instructional moments were most effective and which were most confusing?

## What this domain cannot reliably answer

- Whether students will actually perform better at work after the course. Behavioral transfer in real work settings requires a study conducted weeks or months after course completion — that is Learning Outcome research. Redirect clients who want evidence of behavioral change rather than self-reported post-course readiness.
- Whether the course is priced correctly or perceived as good value. That is Pricing & Value Perception research.
- Whether the institution overall is a good place to study. That is Institutional Experience research.
- How this course compares to competitors' courses on the same topic. That is Proposition Testing or Brand Perception research.
- What new courses the institution should create to serve unmet student needs. That is Consumer Needs research.

---

# Section 3 — Brief Interrogation Guide

## 3.1 Course and context identification

**Information required:** The name and type of the course, the delivery format (video, live instructor, self-paced reading, lab-based, blended), the intended audience, and the approximate course duration.

**Complete answer:** "It is a 12-hour self-paced video course on data analysis fundamentals, designed for working professionals with no prior coding experience."

**Incomplete answer:** "It is an online course about data analysis." Probe: "What format does the course use — is it primarily video, live sessions, written material, or a mix? And roughly how long does a student take to complete it from start to finish?"

**Required:** Yes.

## 3.2 Stated learning objectives

**Information required:** The specific skills or knowledge outcomes the course claims to produce, as stated in the course description or defined by the client.

**Complete answer:** "By the end of the course students should be able to build a basic data dashboard in Excel and interpret descriptive statistics without assistance."

**Incomplete answer:** "Students should understand data analysis." Probe: "What specifically should a student be able to do after this course that they could not do before? Can you describe what success looks like for a student who completes it?"

**Required:** Yes. The coverage model cannot be correctly initialized without stated objectives. If the client cannot articulate behavioral learning objectives, the Creation agent must help them define at least two concrete ones before proceeding. A brief with only topic-area descriptions fails the constitutional constraint in Section 7.

## 3.3 Primary concern driving the research

**Information required:** What the client is most worried about or most curious about. This is what determines which coverage nodes are elevated to critical status.

**Complete answer:** "We suspect students are completing the course but not retaining the practical skills — they pass our internal quiz but then say they cannot apply the concepts at work."

**Incomplete answer:** "We just want to know how students feel about it." Probe: "Is there a specific part of the course — the content itself, the way it is delivered, the pacing, or the outcomes students are actually achieving — that you are most uncertain about? Or is there a signal you have already seen, like completion rates or assessment scores, that made you decide to do this research now?"

**Required:** Yes. Without this, coverage node weights cannot be set correctly.

## 3.4 Delivery format specifics

**Information required:** If the course uses multiple delivery formats, what the proportion of each is and whether students have any choice in format. If it is live instruction, how many instructors deliver the content and how the sessions are structured.

**Required:** Yes for multi-format or live courses. For single-format self-paced courses where the format is fully described in 3.1, this is already captured.

## 3.5 Student population characteristics

**Information required:** The typical student's prior knowledge level when entering the course, their primary motivation for taking it (employer-required, academic requirement, voluntary professional development, personal interest), and any relevant context about their relationship to the subject matter.

**Complete answer:** "They are mid-career professionals in their 30s and 40s, most of whom were required by their employer to complete the course as part of a digital transformation initiative. Their attitudes are mixed — some are enthusiastic, many are skeptical about whether the skills are relevant to their actual work."

**Required:** Yes. Motivation and prior knowledge are the two variables that most affect how the Conducting agent must approach the session and calibrate the Psychological Engine's social desirability thresholds.

## 3.6 What will be done with the findings

**Information required:** The specific actions the client will take based on the research findings across positive, negative, and mixed outcome scenarios. See Section 4 for the full interrogation guide.

**Required:** Yes. This populates the decision map section of the expertState brief.

---

# Section 4 — Decision Map Interrogation

This is the most critical and most frequently underspecified section. The Creation agent must not trigger handoff until all three outcome scenarios are answered with concrete actions, not statements of intention.

## The three scenarios to interrogate

**If findings are positive** — students report strong mastery, high confidence in applying their learning, and clear content quality:

Probe: "If students consistently tell us the course is working well and they feel genuinely prepared to apply the skills, what does that change for you? Does the course get scaled to more employees, promoted externally, or maintained as is?"

**If findings are negative** — students report significant gaps between what was taught and what they can now do, or persistent confusion about specific content:

Probe: "If we find that students are completing the course but cannot actually apply what they were taught — that there is a real gap between course completion and practical readiness — what happens next? Do you have the capacity and timeline to redesign the weaker sections, or would findings like that lead to a different kind of decision, like replacing the course or changing the delivery method entirely?"

**If findings are mixed** — some content areas are working well and others are not, or some student types are achieving mastery while others are not:

Probe: "If the picture is uneven — say, the foundational modules are effective but the advanced sections are losing people — how do you decide what to prioritize for improvement? Do you need the research to recommend what to address first, or are there existing constraints on what can realistically be changed in the next development cycle?"

## Recognizing an incomplete decision map

"We will take action based on what the research shows" is not a decision map. It is a deferral. The agent must probe further: "That makes sense — I want to make sure the research output is structured in a way that makes that action as clear as possible. What would you need to see in the findings to feel confident that a curriculum redesign is justified? What threshold of negative feedback would trigger that decision?"

---

# Section 5 — Coverage Model Specification

**Coverage model version: 1.0.0**

The following nodes must be initialized in the expertState coverage tracker before handoff to Conducting. The Conducting agent must verify its operational coverage model matches this version before beginning the session.

## Critical nodes — session is invalid if these do not reach threshold

| Node ID | Label | Weight | Confidence Threshold | Minimum Respondent Turns |
|---|---|---|---|---|
| CE-01 | Learning objective alignment | High | 0.75 | 2 |
| CE-02 | Practical application readiness | High | 0.75 | 2 |
| CE-03 | Content clarity and depth | High | 0.75 | 2 |

## Standard nodes — should reach threshold in a complete session

| Node ID | Label | Weight | Confidence Threshold | Minimum Respondent Turns |
|---|---|---|---|---|
| CE-04 | Instructional delivery effectiveness | Medium | 0.65 | 1 |
| CE-05 | Engagement trajectory | Medium | 0.65 | 1 |
| CE-06 | Expectation versus reality gap | Medium | 0.65 | 1 |

## Optional nodes — pursue if time and engagement permit after critical nodes are covered

| Node ID | Label | Weight | Confidence Threshold | Minimum Respondent Turns |
|---|---|---|---|---|
| CE-07 | Specific content area performance | Low | 0.50 | 1 |
| CE-08 | Peer learning and cohort dynamics | Low | 0.50 | 1 |
| CE-09 | Curriculum improvement suggestions | Low | 0.50 | 1 |

## Node hierarchy

CE-01 is the root node. CE-02 and CE-03 are its direct children. CE-04 is a child of CE-03. CE-05 and CE-06 are children of CE-01. CE-07 is a child of CE-03. CE-08 and CE-09 are standalone optional nodes with no parent-child dependency.

---

# Section 6 — Audience Model Interrogation Guide

## Psychographic dimensions to capture in the expertState audienceModel

**Learning motivation type.** Whether the student took this course by choice or by requirement is the single most important variable in this domain. Mandatory training creates social desirability pressure that inflates positive responses — students associate criticizing a required course with seeming resistant to professional development. The Creation agent must identify this and flag it in audienceModel.knownBiases.

Probe: "Were students required to take this course by their employer or institution, or did they choose it? And if required, how was it framed to them — as a development opportunity or as a compliance requirement?"

**Prior knowledge level.** Whether students were complete beginners, had partial background, or had mixed levels within the same cohort. This determines whether content clarity gaps are a course design problem or an audience-course mismatch problem — a distinction that significantly changes the Analytics interpretation.

Probe: "What level of prior knowledge did students bring to the course when they started? Was the course designed for complete beginners, or did it assume some existing background in the subject?"

**Application immediacy.** Whether students are expected to apply the learning immediately after the course, within several months, or whether this is more foundational theoretical preparation. This affects how the CE-02 node (practical application readiness) should be evaluated — students who will not apply skills for six months will naturally feel less immediately ready than those returning to tasks where the skills are needed tomorrow.

Probe: "How soon after completing the course would students typically be expected to use these skills in their actual work or studies?"

**Cohort format.** Whether students experienced the course individually (self-paced, isolated) or as part of a cohort (synchronous, with peer interaction). CE-08 is only a relevant node for cohort-based courses.

---

# Section 7 — Constitutional Constraints

## Blocking constraints — the brief cannot be marked complete without satisfying these

**Constraint 1: Behavioral learning objectives required.**
The brief must contain at least two specific, behavioral learning objectives — things a student should demonstrably be able to do after the course, not topic areas they will be exposed to. "Students will understand data analysis" fails this constraint. "Students will be able to interpret a correlation coefficient and explain what it means for a business decision" satisfies it. If the client cannot provide behavioral objectives from course documentation, the Creation agent must work with them to define at least two before proceeding.

*Why:* Without behavioral outcomes, the Analytics agent has no baseline against which to measure student-reported mastery. CE-01 and CE-02 cannot be interpreted without them.

**Constraint 2: Negative outcome decision required.**
The decision map must contain a concrete, specific consequence for the negative outcome scenario — a redesign commitment, a delivery method change, an instructor review process, or a cohort hold. "We will review the findings" does not satisfy this constraint.

*Why:* Course efficacy research that cannot trigger a curriculum or delivery intervention produces data with no action path. The Analytics report structure depends on knowing what the client will do with negative findings.

**Constraint 3: Delivery format specified.**
The delivery format must be recorded. For multi-format courses, the client must indicate which format is considered most central to the learning experience or most problematic, so the Conducting agent can weight CE-04 appropriately.

## Advisory constraints — brief can proceed but limitation must be noted in expertState

**Advisory 1: Undocumented objectives.** If the client is estimating learning objectives from memory rather than from course documentation, note this in the brief. The Analytics agent must flag that CE-01 assessment is based on recalled rather than documented objectives, which reduces its reliability.

**Advisory 2: Mixed mandatory/voluntary cohort.** If the student population contains both mandatory and voluntary participants, note the approximate split in the audienceModel. The Conducting agent will need to identify which category applies to each respondent during warmup, and Analytics will need to weight their responses accordingly.

---

# Section 8 — Duration Calibration Guide

| Objectives count | Delivery format | Minimum session duration | Recommendation |
|---|---|---|---|
| 1–2 objectives | Any single format | 12–15 minutes | Standard |
| 3–4 objectives | Any single format | 18–22 minutes | Standard |
| 3–4 objectives | Multi-format or live | 22–26 minutes | Add 4 minutes for CE-04 |
| 5+ objectives | Any format | 28–35 minutes | Recommend prioritizing to 4 or fewer |

Courses with complex technical subject matter require longer sessions because CE-03 (content clarity) typically needs more turns to reach threshold — students must locate specific moments of confusion rather than give a general impression.

Live-instruction courses add approximately four minutes to the baseline because CE-04 (instructional delivery effectiveness) requires probing instructor-specific behaviors, which demands more conversational turns than evaluating a fixed video or text format.

If a client insists on covering more than four primary objectives in under 20 minutes, the Creation agent must note in the brief that coverage of standard and optional nodes will likely be incomplete and that the Analytics report will reflect this as a coverage limitation rather than a research finding.

---

# Section 9 — Handoff Checklist

All fields must be populated and pass validation before the Creation agent sets `sessionMeta.status` to `brief_complete`. Any failed validation returns the agent to conversation.

| Field | Validation rule |
|---|---|
| `brief.domain` | Must equal "course_efficacy" |
| `brief.subDomain` | Must contain the course name or type |
| `brief.objectives` | Minimum 2 entries; each must be a behavioral outcome statement, not a topic description |
| `brief.decisionMap.ifPositive` | Must be a concrete action, not a generic intention |
| `brief.decisionMap.ifNegative` | Must name a specific consequence such as redesign, delivery change, or cohort hold |
| `brief.decisionMap.ifMixed` | Must describe a prioritization rule or decision logic |
| `brief.estimatedDurationMinutes` | Must be reconciled against objective count using Section 8 |
| `brief.sensitiveTopics` | Minimum 1 entry — mandatory training bias flag or self-assessment inflation flag |
| `brief.clientContext` | Course description, delivery format, and stated learning objectives recorded |
| `audienceModel.expectedVocabularyLevel` | Set to low, medium, high, or technical |
| `audienceModel.knownBiases` | Minimum 1 entry |
| `audienceModel.expectedRespondentMotivation` | Set to intrinsic, extrinsic, or ambivalent |
| `audienceModel.sensitivityFlags` | Populated if mandatory training context identified |
| `coverageTracker.nodes` | All 9 nodes initialized with correct IDs, weights, and thresholds per Section 5 |
| `sessionMeta.coverageModelVersion` | Must equal 1.0.0 |