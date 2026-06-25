export function buildOnboardingLearningPatternAnalysisPrompt(input: {
  studentName: string;
  interestProfileJson: string;
  currentProfilesJson: string;
  relevantMemoriesText: string;
  transcriptText: string;
}) {
  return `You are creating the initial learning-pattern memory for a student after onboarding.

Student name: ${input.studentName}
Interest profile:
${input.interestProfileJson}

Current learning-pattern profiles:
${input.currentProfilesJson}

Relevant existing memories:
${input.relevantMemoriesText}

Onboarding transcript:
${input.transcriptText}

Instructions:
- Produce one global profile.
- Use the onboarding conversation to form preliminary readings on:
  concept entry point preference, abstraction tolerance, challenge response,
  processing preference, social vs independent orientation, memory approach,
  and relationship with being wrong.
- Keep patternConfidence low because this is an onboarding hypothesis, not established evidence.
- Cap patternConfidence at 0.25.
- Keep studentSummary supportive and non-deterministic.
- Keep teacherSummary practical and plain-language.
- Add observation memories that are short, evidence-based, and useful later.
- Do not invent certainty that the transcript does not support.`;
}

export function buildSessionLearningPatternAnalysisPrompt(input: {
  studentName: string;
  subjectKey: string;
  subjectLabel: string;
  topicTitle: string;
  interestProfileJson: string;
  currentProfilesJson: string;
  relevantMemoriesText: string;
  reportJson: string;
  stateJson: string;
  transcriptText: string;
  outOfSessionEvidenceText: string;
}) {
  return `You are updating a student's learning-pattern memory after a completed tutoring session.

Student: ${input.studentName}
Subject: ${input.subjectLabel} (${input.subjectKey})
Topic: ${input.topicTitle}
Interest profile:
${input.interestProfileJson}

Current learning-pattern profiles:
${input.currentProfilesJson}

Relevant memory recall:
${input.relevantMemoriesText}

Session report:
${input.reportJson}

Session state:
${input.stateJson}

Session transcript:
${input.transcriptText}

Out-of-session evidence to treat as low-weight:
${input.outOfSessionEvidenceText}

Instructions:
- Produce exactly two profiles:
  1. a global profile
  2. a subject profile for ${input.subjectLabel}
- Update the six long-term dimensions:
  explanation responsiveness, interest resonance, cognitive approach,
  motivational pattern, confidence/mindset pattern, persistent misconceptions.
- Preserve onboarding insights unless the new evidence clearly weakens them.
- Pattern confidence must rise gradually based on evidence volume; do not jump to certainty from one session.
- If evidence contradicts older assumptions, reflect that in the updated profile.
- Persistent misconceptions become recurring at recurrenceCount 2 and persistent at 3.
- studentSummary must explain tendencies, not identities.
- teacherSummary must be operational and concise.
- Add observation memories that capture useful evidence from this session.`;
}
