---
name: Learning Outcome Research (Analytics)
description: Analytics agent skill for interpreting Learning Outcome Research sessions. Covers interpretive frameworks, coverage analysis, quality handling, benchmark contextualization, output format, and limitation language for behavioral change and skill transfer research.
id: el-learning-outcome-analytics
version: 1.0.0
---

## Section 1: What This Domain's Data Actually Means

Learning Outcome Research data is fundamentally different from satisfaction research data. A respondent can report high satisfaction with a course and produce no transferable behavior. Conversely, a respondent can report the course was unimpressive and demonstrate deep, habitual behavioral change. The Analytics agent must resist the temptation to treat positive sentiment as a proxy for learning effectiveness. The only analytically valid currency in this domain is behavioral evidence — specific instances of application that are described with enough detail to be credible.

**The most common misreading:** Conflating knowledge recall with behavioral transfer. If a respondent can describe the course content accurately, that demonstrates retention. It does not demonstrate transfer. The Analytics agent must keep these two nodes clearly distinct in its output. A high Knowledge Retention score paired with a low Skill Transfer score is not a contradiction — it is a specific and important finding about the gap between what was learned and what was applied.

**The second most common misreading:** Treating absence of transfer evidence as evidence of no transfer. If the Skill Transfer node has low confidence but the session reliability score is also low — and social desirability flags were raised during the session — the absence of specific transfer examples may reflect the respondent's unwillingness to be honest rather than genuine lack of application. Analytics must distinguish between "no transfer occurred" and "transfer could not be assessed reliably." These require different language in the output.

**What a high coverage score with a low reliability score means:** The session covered all the nodes, but the quality of the evidence in those nodes is compromised. In Learning Outcome Research, this typically indicates that the respondent was performing positivity throughout — providing the socially appropriate answer at every stage. The findings must be reported with explicit reliability caveats. Do not report a positive transfer finding from a low-reliability session without noting the confidence limitation.

**What a short session duration means:** If the session duration is below 25 minutes and the transcript shows coverage of all primary nodes, this likely indicates that the respondent gave brief, general answers that were not adequately probed. High node coverage from rapid-fire short answers is not equivalent to deep coverage. Analytics must cross-check duration against average turn length — a 20-minute session with 12 respondent turns is categorically different from a 20-minute session with 6 respondent turns, and both are different from a 35-minute session with 10 deeply developed turns.

---

## Section 2: Coverage Interpretation Guide

**Knowledge Retention — low confidence:**
The respondent could not articulate the core concepts of the training in their own words. This is meaningful when the time elapsed since training is less than 60 days — it suggests the learning did not consolidate. At 90 days, moderate retention decay is normal and should be contextualized against benchmarks before being characterized as a finding. Do not interpret low retention at 90 days as a training failure without checking the time-decay benchmarks.

**Knowledge Retention — high confidence, low Skill Transfer confidence:**
This is the "learned but didn't use" profile. It is analytically distinct from failure to learn. The interpretation depends on what the Barriers nodes contain. If barriers coverage is also high, this profile indicates environmental prevention of transfer. If barriers coverage is low, it may indicate that the respondent did not see the applicability of the learning to their actual work — a relevance failure in the training design.

**Skill Transfer — low confidence with high social desirability flags:**
Do not interpret this as evidence that transfer did not occur. Report as: insufficient evidence of transfer was obtained in this session, with social desirability flags suggesting the respondent may not have been fully candid about their experience. Recommend corroboration through manager observation or a follow-up session.

**Skill Transfer — high confidence, Behavioral Change — low confidence:**
The respondent applied a skill on a specific occasion but has not integrated it into routine behavior. This is a partial transfer finding — meaningful and worth reporting, but distinct from sustained behavioral change. Use language that preserves this distinction in the output.

**Barriers — high confidence, divergence from Skill Transfer confidence:**
If Barriers coverage is high and Skill Transfer is low, the interpretation is an organizational or environmental prevention story — capability existed but conditions did not allow application. This is a fundamentally different recommendation for the client (fix the environment, not the training) than a training design failure. Analytics must make this distinction explicit.

**Efficacy Belief — low confidence with strong Skill Transfer evidence:**
The respondent demonstrated genuine application but does not feel confident about ongoing use. This is an underrecognized finding — the training produced capability but not psychological readiness. The recommendation implication is post-training reinforcement (coaching, peer practice, manager support) rather than training redesign.

---

## Section 3: Quality Weighting Rules

**Sessions below 0.50 reliability score:**
These sessions must be flagged in the output. Do not include them in primary findings without explicit labeling. If the session is the only data point for a given objective, report that the objective could not be assessed reliably in this session and note what further data collection would be needed.

**Turns with social desirability flags:**
In Learning Outcome Research, the pre-probe version of a contradicted statement is generally less reliable than the post-probe version. When the normalization probe produced a different answer from the opening answer, use the post-probe version as the primary evidence and note the initial positive framing as a social desirability artifact in the session notes, not in the client-facing report.

**Inconsistency flags — Knowledge Retention vs. Application evidence:**
If a respondent claimed strong retention early in the session but application questions revealed they could not accurately recall the core concepts in context, treat the application-stage evidence as more reliable. Respondents often believe they remember content more accurately than they do — testing that memory through application reveals the true retention state.

**Sessions with organizational disruption flags:**
If the brief recorded an organizational disruption since training (restructure, role change, tool change), and the session shows low transfer, this is not simply a training effectiveness failure. Weight the Barriers node data more heavily than in standard sessions. The finding headline should be "transfer was disrupted by organizational context" rather than "training did not produce behavioral change."

---

## Section 4: Benchmark Context

Learning Outcome Research benchmarks must be used with strict contextual discipline. The following rules apply:

**Segmentation before citation:** Behavioral transfer rate benchmarks must be segmented by training format (in-person, e-learning, blended) before being cited. An in-person two-day workshop has a structurally different transfer profile than a self-paced e-learning module of equivalent content. Cross-format comparisons are not valid without this segmentation.

**Time-decay adjustment:** Benchmarks for knowledge retention are highly sensitive to the time elapsed since training. A 30-day retention benchmark cannot be applied to a 90-day session. The Analytics agent must retrieve the time-appropriate benchmark from the RAG store.

**Industry context:** Where industry benchmarks are available, they should be used in preference to cross-industry averages. Cross-industry transfer benchmarks are almost always misleading — the transfer conditions (organizational support, complexity of application, frequency of relevant situations) differ too significantly across industries to produce a meaningful average.

**What benchmarks cannot tell the client:** Benchmarks describe what is typical, not what is achievable. A client whose transfer rate is below benchmark has a real finding to act on, but a client at benchmark should not be told their training is working well — benchmark represents average performance, and average includes a great deal of preventable failure. Frame benchmarks as context, not targets.

---

## Section 5: Output Format Specification

Learning Outcome Research reports follow this structure. Every section must connect to a specific entry in the decision map from the brief. If a finding cannot be connected to a decision map entry, it should be noted in the report as additional context, not as a primary finding.

**Section 1: Study Parameters**
State the training event, completion date, time elapsed, and the number and profile of respondents. Note any brief-documented contextual factors (organizational disruptions, mandatory attendance, remedial population flags). This section is factual and does not contain findings.

**Section 2: Executive Summary**
Two to four sentences. What was the primary finding on the core research question — did behavioral transfer occur, and where? Explicitly connect to the decision map outcome. Do not use hedging language in the executive summary — save precision qualifications for the detailed findings sections.

**Section 3: Transfer Evidence**
This is the primary section. Organized by learning objective, not by coverage node. For each objective: what evidence of transfer was found, what was the quality and specificity of that evidence, and what is the interpretation. Use respondent language to anchor findings — "one respondent described [paraphrased instance]" is more credible than bare assertions. Distinguish clearly between single-instance application and sustained behavioral change.

**Section 4: Knowledge Retention**
What the respondents retained from the training at the tested interval. Note time-decay context. Where retention and transfer diverge — high retention with low transfer, or low retention with described application habits that suggest procedural memory rather than declarative recall — make this explicit.

**Section 5: Barriers to Application**
What prevented transfer where it did not occur. Distinguish organizational barriers from individual barriers. Connect directly to the decision map's negative outcome action — if barriers are the primary explanation for limited transfer, state this and connect it to the decision the client indicated they would take.

**Section 6: Decision Map Response**
Explicit section that maps each finding to its corresponding decision map entry from the brief. Every decision the client identified must be addressed, even if the finding is inconclusive. Do not leave a decision map entry unaddressed — if data was insufficient to inform it, say so explicitly.

**Section 7: Limitations and Confidence Notes**
Reliability flags, incomplete coverage nodes, session count limitations, and any contextual factors that limit the generalizability of findings. Use the framing language from Section 7 of this skill file. This section is required and must not be omitted even when findings are strong.

**Attribution language:** Findings are attributed to respondent evidence, not stated as bare assertions. "Evidence from this session suggests..." rather than "The training produced..." When findings are from a single session, they cannot be generalized and must be framed as indicative rather than conclusive.

**Uncertainty language:** Use "evidence suggests," "the data indicates," and "this session shows" rather than "the training succeeded" or "the respondent failed to transfer." Learning Outcome Research findings are always about this respondent in this context at this time — overgeneralization is a methodological error, not just a stylistic one.

---

## Section 6: Multi-Session Analysis Guide

**Identifying patterns across respondents:**
Transfer evidence patterns become analytically reliable when they appear consistently across respondents who differ in role, seniority, and organizational context. A transfer failure on a specific objective that appears in one session may be individual; the same failure across three sessions with different respondents points to the training design or application conditions.

**Segmentation by profile:**
If respondent profiles differ meaningfully — by role, by seniority, by whether attendance was mandatory versus voluntary, by time elapsed since training — findings must be segmented before pattern analysis. Aggregating across these differences produces false averages.

**Contradictory transfer findings:**
If one respondent shows strong transfer on an objective where another shows none, the first interpretive question is whether the application conditions differed (the organizational environment) rather than whether the training worked for one person and not another. Check the Barriers data for both sessions before attributing the divergence to individual differences.

**Aggregate metrics:**
- Transfer rate: Proportion of respondents with Skill Transfer confidence above 0.70 on each objective
- Barrier prevalence: Proportion of respondents where organizational barriers were identified as the primary constraint on transfer
- Retention-transfer gap: Average difference between Knowledge Retention confidence and Skill Transfer confidence across respondents — a high gap is a consistent training relevance signal

---

## Section 7: Flagging and Limitation Language

These are the precise formulations the Analytics agent must use in client-facing output. Generic hedges are not acceptable substitutes.

**When Skill Transfer coverage is below threshold:**
"This session did not produce sufficient specific behavioral evidence to assess transfer on [objective] conclusively. The finding on this objective should be treated as indicative rather than confirmed. [If applicable: The social desirability signals present in this session suggest the respondent may not have fully disclosed their experience, and a follow-up session may produce more reliable evidence.]"

**When session reliability is below 0.50:**
"The reliability indicators for this session — including [specific signal, e.g., social desirability flags, inconsistency flags] — suggest that the findings should be interpreted with caution. This session's data is included as context but has been weighted down in the primary analysis."

**When organizational disruption affected transfer:**
"The transfer findings for this respondent must be interpreted in the context of [disruption documented in brief], which occurred within the transfer window. The limited application evidence is more plausibly explained by the disruption in application conditions than by training design failure. This interpretation should be confirmed through sessions with respondents who did not experience the same disruption."

**When session count is below reliable pattern threshold:**
"Findings from [n] sessions are indicative and cannot support generalizations about the training program's effectiveness across the full participant population. The patterns identified here should be treated as hypotheses to be tested with a larger respondent sample before program-level decisions are made."

**When a decision map entry cannot be addressed:**
"The brief identified [decision] as requiring resolution. The evidence from this session is insufficient to inform this decision with confidence. [Specific reason — e.g., the relevant coverage node ended below threshold; the respondent population may not have been representative.] [Recommended next step.]"