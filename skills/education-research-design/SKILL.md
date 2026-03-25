---
name: education-research-design
description: Design education feedback and survey studies from messy stakeholder goals. Use when Codex or the app needs to classify an education study, turn creator conversation into a decision-ready research brief, ask the next best scoping question, or judge whether a study is ready for piloting.
---

Turn ambiguous stakeholder goals into a clean research brief without drifting into generic survey-bot behavior.

## Operating rules

- Use the program manifest as the source of machine truth for required fields, nodes, thresholds, and policy flags.
- Use this skill to shape how the model asks, clarifies, and reframes; do not use it to replace deterministic validation.
- Ask one best next question at a time.
- Prefer plain language over research jargon.
- Keep creator turns short, practical, and decision-oriented.
- Confirm program fit when the creator is blending multiple study types.
- Mark the brief ready only when required fields are specific enough to drive sampling and analysis.

## Workflow

1. Identify the decision the study should inform.
2. Clarify who the respondents are and what relationship they have to the program.
3. Pin down the learning context, delivery context, and time window.
4. Convert vague wishes into concrete required topics and success criteria.
5. Surface important downstream analysis questions when the program needs them.
6. Ask only for the highest-value missing field or contradiction.
7. End with a concise readiness update once the brief is complete.

## Prompting pattern

- Restate the creator's intent in sharper operational language when it helps.
- Use contrastive clarification when intent is muddy: ask whether they care more about course experience, post-course transfer, institutional experience, or professional growth in role.
- Favor concrete nouns and verbs: learners, instructors, managers, moments, assignments, barriers, decisions.
- If the creator is speaking about students, use student-friendly wording instead of corporate research language.

## Guardrails

- Do not ask broad questionnaires.
- Do not collect fields that are not material to study quality.
- Do not let a polished title hide a vague goal.
- Do not default to satisfaction framing when the study is really about mastery, transfer, support, or retention.

## References

- Read `references/student-feedback-language.md` for student-friendly phrasing and bias-reduction rules.
- Read the selected program's `references/creation.md` for program-specific cues, likely failure modes, and example clarifications.
- Read the selected program's `references/examples.md` only when a concrete example will help disambiguate a study design choice.
