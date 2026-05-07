# Tutoring Feature File Inventory

Systematic inventory of files directly implementing the tutoring/learning feature.

## Database schema

- `db/schema/learning.ts`

## API routes (learning domain)

- `app/api/learning/classrooms/[classroomId]/assigned-surveys/route.ts`
- `app/api/learning/classrooms/[classroomId]/students/route.ts`
- `app/api/learning/classrooms/[classroomId]/topics/route.ts`
- `app/api/learning/classrooms/route.ts`
- `app/api/learning/expert/annotations/route.ts`
- `app/api/learning/expert/assets/[packId]/activate/route.ts`
- `app/api/learning/expert/assets/[packId]/versions/route.ts`
- `app/api/learning/expert/assets/preview/route.ts`
- `app/api/learning/expert/assets/route.ts`
- `app/api/learning/expert/evals/bootstrap/route.ts`
- `app/api/learning/expert/review-queue/route.ts`
- `app/api/learning/expert/sessions/[sessionId]/transcript/route.ts`
- `app/api/learning/interventions/[interventionId]/route.ts`
- `app/api/learning/interventions/route.ts`
- `app/api/learning/invitations/[invitationId]/accept/route.ts`
- `app/api/learning/invitations/[invitationId]/reject/route.ts`
- `app/api/learning/invitations/me/route.ts`
- `app/api/learning/me/patterns/route.ts`
- `app/api/learning/me/route.ts`
- `app/api/learning/onboarding/route.ts`
- `app/api/learning/student-access/activate/route.ts`
- `app/api/learning/students/[studentId]/chat-sessions/[sessionId]/route.ts`
- `app/api/learning/students/[studentId]/chat-sessions/route.ts`
- `app/api/learning/students/[studentId]/chat/route.ts`
- `app/api/learning/students/[studentId]/overview/route.ts`
- `app/api/learning/students/[studentId]/patterns/route.ts`
- `app/api/learning/topics/[topicId]/chat/complete/route.ts`
- `app/api/learning/topics/[topicId]/chat/route.ts`
- `app/api/learning/topics/[topicId]/materials/route.ts`
- `app/api/learning/topics/[topicId]/overview/route.ts`
- `app/api/learning/topics/[topicId]/questions/route.ts`
- `app/api/learning/topics/[topicId]/readiness/route.ts`
- `app/api/learning/topics/[topicId]/reports/route.ts`
- `app/api/learning/topics/[topicId]/status/route.ts`

## Server actions

- `app/actions/classroom.ts`

## Services & domain logic (lib/learning)

- `lib/learning/access.ts`
- `lib/learning/agent-tools.ts`
- `lib/learning/classroom-service.ts`
- `lib/learning/content-scope-service.ts`
- `lib/learning/evidence.ts`
- `lib/learning/expert-access.ts`
- `lib/learning/expert-tutor-model-service.ts`
- `lib/learning/framework-engine.ts`
- `lib/learning/framework-packages.ts`
- `lib/learning/intervention-service.ts`
- `lib/learning/materials.ts`
- `lib/learning/media.ts`
- `lib/learning/mem0.ts`
- `lib/learning/onboarding.ts`
- `lib/learning/out-of-session.ts`
- `lib/learning/pattern-types.ts`
- `lib/learning/patterns.ts`
- `lib/learning/prompting.ts`
- `lib/learning/prompts/conflict-detection.ts`
- `lib/learning/prompts/crystallization.ts`
- `lib/learning/prompts/evidence.ts`
- `lib/learning/prompts/expert-review.ts`
- `lib/learning/prompts/framework-decision.ts`
- `lib/learning/prompts/learning-pattern-analysis.ts`
- `lib/learning/prompts/materials.ts`
- `lib/learning/prompts/onboarding.ts`
- `lib/learning/prompts/out-of-session.ts`
- `lib/learning/prompts/pattern-summaries.ts`
- `lib/learning/prompts/reporting.ts`
- `lib/learning/prompts/session-engine.ts`
- `lib/learning/prompts/student-model-update.ts`
- `lib/learning/prompts/student-turn.ts`
- `lib/learning/prompts/tutor-runtime.ts`
- `lib/learning/provisioning.ts`
- `lib/learning/rag.ts`
- `lib/learning/reporting.ts`
- `lib/learning/runtime.ts`
- `lib/learning/session-engine.ts`
- `lib/learning/storage.ts`
- `lib/learning/student-model-service.ts`
- `lib/learning/student-service.ts`
- `lib/learning/subject-packages.ts`
- `lib/learning/tokens.ts`
- `lib/learning/topic-service.ts`
- `lib/learning/tutor-runtime-service.ts`
- `lib/learning/tutor.ts`
- `lib/learning/tutoring-prompt-service.ts`
- `lib/learning/tutoring-route-orchestrator.ts`
- `lib/learning/tutoring-session-lifecycle.ts`
- `lib/learning/types.ts`

## Client API & query keys

- `lib/api/learning.ts`
- `lib/query-keys.ts`

## Hooks

- `components/learning/hooks/use-student-learning-workspace.ts`
- `components/learning/hooks/use-teacher-learning-workspace.ts`

## UI components

- `components/learning/create-classroom-modal.tsx`
- `components/learning/create-topic-modal.tsx`
- `components/learning/glass-panel.tsx`
- `components/learning/invite-student-modal.tsx`
- `components/learning/learning-hub.tsx`
- `components/learning/log-intervention-modal.tsx`
- `components/learning/metric-tile.tsx`
- `components/learning/section-heading.tsx`
- `components/learning/student-activation-page.tsx`
- `components/learning/student-learning-home.tsx`
- `components/learning/student-profile-page.tsx`
- `components/learning/teacher-learning-home.tsx`
- `components/learning/teacher-reports-page.tsx`
- `components/learning/teacher-student-chat.tsx`
- `components/learning/teacher-student-detail-page.tsx`
- `components/learning/teacher-topic-detail-page.tsx`
- `components/student/student-sidebar.tsx`

## Pages (dashboard learning)

- `app/[locale]/(dashboard)/dashboard/learning/page.tsx`
- `app/[locale]/(dashboard)/dashboard/learning/profile/page.tsx`
- `app/[locale]/(dashboard)/dashboard/learning/reports/page.tsx`
- `app/[locale]/(dashboard)/dashboard/learning/students/[studentId]/page.tsx`
- `app/[locale]/(dashboard)/dashboard/learning/topics/[topicId]/page.tsx`

## Workers

- `workers/tutoring-report.worker.ts`

