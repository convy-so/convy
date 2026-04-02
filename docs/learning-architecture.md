# Learning Architecture

## Core Decision

This feature should be implemented as a hybrid system:

- Workflows handle teacher-led structure, permissions, onboarding triggers, progress checkpoints, and report generation.
- A conversational agent handles the student-facing tutoring session inside the boundaries defined by the workflow.

That split keeps the product simple and auditable. The teacher decides class membership, topic boundaries, source material, and learning outcomes. The agent only personalizes delivery inside those constraints.

## Domain Model

The implementation adds a dedicated learning domain instead of overloading the existing survey tables:

- `classrooms`: teacher-owned classes inside a workspace.
- `classroom_students`: teacher-managed student seats and invite state.
- `learning_topics`: teacher-defined topics with explicit learning outcomes and grounding policy.
- `topic_materials`: uploaded files and their extraction/indexing state.
- `student_interest_profiles`: the private student profile built from the first-login conversation.
- `learning_sessions` and `learning_messages`: tutoring conversations, quizzes, and onboarding interactions.
- `student_progress_reports`: teacher-visible academic summaries derived from sessions.

## Why This Is Hybrid, Not Pure Agent

The high-risk parts of the product are deterministic:

- who can create a student account
- which class the student belongs to
- what material is allowed
- which learning outcomes count as success
- what goes to the teacher
- what remains private to the student-agent relationship

Those should not be delegated to open-ended model behavior.

The agent is appropriate for:

- first-login interest discovery
- explanations
- adaptive questioning
- quizzes
- low-stakes reflective check-ins
- turning teacher-defined goals into personalized openings

## Grounding Rules

Factual content should come from teacher material only. The model can still use general reasoning to:

- simplify explanations
- generate analogies
- adapt tone to grade band
- ask diagnostic questions
- create quizzes from the grounded material

Web use should be limited to session openings for real-world topics, and even then only as a motivational hook. The body of instruction remains grounded in teacher-provided material.

## Privacy Split

The student interest profile exists only to improve tutoring. Teacher reports should receive academic signals and only the minimal safe subset of personalization metadata, such as high-level context tags, not the full private discovery conversation.

## Recommended Runtime

1. Teacher creates classroom.
2. Teacher provisions students.
3. Teacher defines topic, outcomes, and uploads material.
4. Workflow extracts and indexes teacher material.
5. Student logs in for the first time.
6. Agent runs the one-time interest discovery conversation.
7. Workflow stores the structured profile.
8. Student tutoring sessions run with grade-aware prompts plus topic grounding.
9. Workflow converts session evidence into teacher reports.

## Backend Surface

Implemented backend routes:

- `POST /api/learning/classrooms`
- `GET /api/learning/classrooms`
- `POST /api/learning/classrooms/[classroomId]/students`
- `GET /api/learning/classrooms/[classroomId]/students`
- `POST /api/learning/classrooms/[classroomId]/topics`
- `GET /api/learning/classrooms/[classroomId]/topics`
- `POST /api/learning/topics/[topicId]/materials`
- `GET /api/learning/topics/[topicId]/materials`
- `GET /api/learning/topics/[topicId]/readiness`
- `POST /api/learning/topics/[topicId]/status`
- `GET /api/learning/me`
- `GET /api/learning/onboarding`
- `POST /api/learning/onboarding`
- `GET /api/learning/topics/[topicId]/chat`
- `POST /api/learning/topics/[topicId]/chat`
- `GET /api/learning/topics/[topicId]/reports`
- `GET /api/learning/student-access/activate`
- `POST /api/learning/student-access/activate`

Implementation notes:

- Material upload is TypeScript-native.
- Plain-text notes are extracted locally.
- PDFs are converted into text through OpenAI file input processing, then indexed into local embeddings for topic-scoped RAG.

## Sources

- Better Auth admin and organization plugins support controlled user-management and invitation patterns: [better-auth.com/docs/plugins/admin](https://www.better-auth.com/docs/plugins/admin)
- OpenAI recommends the Responses API for new agentic applications and highlights built-in retrieval tools such as file search: [platform.openai.com/docs/guides/migrate-to-responses](https://platform.openai.com/docs/guides/migrate-to-responses)
- The FTC has explicitly warned edtech providers not to collect more student data than is necessary, especially for children: [ftc.gov/node/81056](https://www.ftc.gov/node/81056)
