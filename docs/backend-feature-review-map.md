# Backend Feature Review Map

Purpose: give a review-ready map of the current backend surface for teacher and expert functionality, grouped by workflow rather than by directory.

Current codebase date reviewed: 2026-05-14

## Important context

- This map is based on the current code in `app/`, `lib/`, and `db/`, not on older docs.
- `docs/tutoring-feature-file-inventory.md` and `docs/tutoring-feature-deep-review.md` are stale and should not be treated as the current source of truth.
- `app/actions/survey-media.ts` is intentionally disabled. Survey media is not an active backend feature right now.

## Highest-priority mismatches to review first

These are concrete backend drift items already visible in the current codebase.

1. `lib/api/learning.ts` previously contained stale mutation helpers for removed or unsupported learning routes.
   - This was fixed in the current working tree by removing those dead helpers.
   - See `docs/backend-invariants-and-bugs-explained.md` for the details.
2. Current `app/api/learning/**` routes present are only:
   - `classrooms`
   - `classrooms/[classroomId]/assigned-surveys`
   - `classrooms/[classroomId]/students`
   - `classrooms/[classroomId]/topics`
   - `expert/annotations`
   - `expert/assets`
   - `expert/assets/[packId]/activate`
   - `expert/assets/[packId]/versions`
   - `expert/assets/preview`
   - `expert/evals/bootstrap`
   - `expert/review-queue`
   - `expert/sessions/[sessionId]/transcript`
   - `interventions`
   - `me/patterns`
   - `onboarding`
   - `student-access/activate`
   - `students/[studentId]/chat-sessions`
   - `students/[studentId]/chat-sessions/[sessionId]`
   - `students/[studentId]/patterns`
   - `topics/[topicId]/chat`
   - `topics/[topicId]/materials`
   - `topics/[topicId]/questions`
   - `topics/[topicId]/readiness`
   - `topics/[topicId]/reports`

## Canonical backend entry points

These are the primary places where teacher/expert backend behavior is assembled.

- `lib/server/app-queries.ts`
  - Main server-component data loader layer.
  - Teacher dashboard, learning hub, survey detail, analytics, notifications, settings, and student-side bootstrapping all read through here.
- `app/actions/classroom.ts`
  - Re-export layer for classroom, topic, intervention, tutoring, and teacher-student chat actions.
- `app/actions/survey.ts`
  - Re-export layer for survey lifecycle and survey settings actions.
- `app/actions/ai-ops.ts`
  - Expert AI ops, guidance packs, few-shot library.
- `app/actions/expert-knowledge.ts`
  - Expert crystallization review and approval.
- `app/api/learning/**`
  - Route handlers for tutoring, classrooms, materials, patterns, expert review, and activation.
- `app/api/surveys/**`
  - Route handlers for creation, refinement, sample review, respondent sessions, responses, and analytics.

## Review order

If you want to review backend risk in the best order, use this sequence:

1. Access control and role enforcement
2. Teacher survey lifecycle
3. Teacher classroom and topic management
4. Student tutoring flow that teacher-owned topics depend on
5. Survey analytics and respondent flows
6. Expert framework/runtime/QA systems
7. Admin and operational support flows

## Teacher workflows

### 1. Dashboard shell and teacher navigation state

What this backend feature does:
- Resolves current session, role, locale, notifications, and learning role state before teacher pages render.

Server components:
- `app/[locale]/(dashboard)/layout.tsx`
- `app/[locale]/(dashboard)/dashboard/page.tsx`
- `app/[locale]/(dashboard)/dashboard/analytics/page.tsx`
- `app/[locale]/(dashboard)/dashboard/notifications/page.tsx`
- `app/[locale]/(dashboard)/dashboard/settings/page.tsx`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/auth/dal.ts`
- `lib/i18n/resolve-locale.ts`
- `lib/cache.ts`

DB-backed behavior:
- User session-based role resolution
- Notification reads
- Dashboard counts for surveys, classrooms, topics, students
- Recent survey list
- Recent survey response activity
- Analytics-ready active survey list

Inspect first:
- `app/[locale]/(dashboard)/layout.tsx`
- `app/[locale]/(dashboard)/dashboard/page.tsx`
- `app/[locale]/(dashboard)/dashboard/analytics/page.tsx`
- `lib/server/app-queries.ts`

Core invariants:
- Students must not enter teacher dashboard routes.
- Preferred locale redirect must not create loops.
- Dashboard counts must be scoped to the signed-in teacher only.
- Cached dashboard entries must be invalidated when related actions mutate data.

Likely bug classes:
- Cross-role leakage
- Wrong user scoping in cached queries
- Stale counts after action mutations
- Teacher/student redirect drift

### 2. Survey creation, editing, publishing, and retirement

What this backend feature does:
- Creates survey drafts, updates settings, finalizes creation, generates public links, publishes, pauses, resumes, duplicates, and deletes surveys.

Server components:
- `app/[locale]/(dashboard)/dashboard/create/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/sample-review/page.tsx`

Server actions:
- `app/actions/survey/survey-lifecycle-actions.ts`
- `app/actions/survey/survey-settings-actions.ts`
- `app/actions/survey/shared.ts`
- `app/actions/survey.ts`

API routes:
- `app/api/surveys/route.ts`
- `app/api/surveys/[surveyId]/create/route.ts`
- `app/api/surveys/[surveyId]/details/route.ts`
- `app/api/surveys/[surveyId]/finalize/route.ts`
- `app/api/surveys/[surveyId]/refinement/route.ts`
- `app/api/surveys/[surveyId]/refinement/proposals/[proposalId]/route.ts`
- `app/api/surveys/[surveyId]/sample/route.ts`
- `app/api/surveys/[surveyId]/sample/feedback/route.ts`
- `app/api/surveys/shared/[shareableLink]/route.ts`
- `app/api/media/surveys/[surveyId]/[mediaId]/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/survey-access.ts`
- `lib/surveys/surveys-route-service.ts`
- `lib/education/storage/*.ts`
- `lib/education/creation-workflow.ts`
- `lib/education/survey-create-orchestrator.ts`
- `lib/collaboration-service.ts`

DB-backed behavior:
- Survey draft persistence
- Survey settings and custom slug updates
- Creation conversation state
- Research brief and coverage-plan dependency checks
- Sample review gating
- Public/shareable link generation
- Media access authorization

Inspect first:
- `app/actions/survey/survey-lifecycle-actions.ts`
- `app/actions/survey/survey-settings-actions.ts`
- `app/api/surveys/[surveyId]/create/route.ts`
- `app/api/surveys/[surveyId]/sample/route.ts`
- `lib/survey-access.ts`

Core invariants:
- Only authorized users can edit or publish.
- Draft/sample-review/active/completed transitions must be valid.
- Publishing requires a complete research brief and active coverage plan.
- Duplicated surveys must not inherit live share links or active response state.
- Custom slug and shareable link namespace must remain unique.

Likely bug classes:
- Unauthorized creator/editor actions
- Invalid status transitions
- Duplicate share link or slug collisions
- Partial state after creation/finalization failures
- Cached survey list/detail views lagging after mutations

### 3. Survey analytics, response review, and analytics chat

What this backend feature does:
- Builds survey analytics views, response history, session detail views, analytics chat sessions, comparison, transcription, and feedback on conversations.

Server components:
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/analytics/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/analytics/chat/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/responses/[responseId]/page.tsx`

Server action:
- `refreshSurveyAnalyticsAction`

API routes:
- `app/api/surveys/[surveyId]/analytics/route.ts`
- `app/api/surveys/[surveyId]/analytics/status/route.ts`
- `app/api/surveys/[surveyId]/analytics/history/route.ts`
- `app/api/surveys/[surveyId]/analytics/compare/route.ts`
- `app/api/surveys/[surveyId]/analytics/conversations/route.ts`
- `app/api/surveys/[surveyId]/analytics/chat/route.ts`
- `app/api/surveys/[surveyId]/analytics/chat-sessions/route.ts`
- `app/api/surveys/[surveyId]/analytics/chat-sessions/[sessionId]/route.ts`
- `app/api/surveys/[surveyId]/analytics/transcribe/route.ts`
- `app/api/surveys/[surveyId]/responses/route.ts`
- `app/api/surveys/[surveyId]/responses/[responseId]/route.ts`
- `app/api/surveys/[surveyId]/conversations/[conversationId]/feedback/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/analytics.ts`
- `lib/analytics/conversation-queries.ts`
- `lib/surveys/use-cases/get-survey-analytics.ts`
- `lib/education/analytics-workflow.ts`
- `lib/education/storage/analytics-storage.ts`
- `lib/voice/analytics-stt.ts`

DB-backed behavior:
- Latest analytics snapshot lookup
- Survey session counts and detail reads
- Transcript/evidence/coverage-plan hydration
- Analytics chat session persistence
- Conversation-level participant feedback storage

Inspect first:
- `app/api/surveys/[surveyId]/analytics/route.ts`
- `app/api/surveys/[surveyId]/analytics/chat-sessions/route.ts`
- `app/api/surveys/[surveyId]/responses/[responseId]/route.ts`
- `lib/surveys/use-cases/get-survey-analytics.ts`
- `lib/education/storage/analytics-storage.ts`

Core invariants:
- Only users with `canView` should see analytics and responses.
- Analytics chat sessions must be scoped by survey and authorized user.
- Transcript/evidence views must resolve the correct session identity.
- Status endpoints must agree with actual analytics snapshot state.

Likely bug classes:
- Viewing analytics across unauthorized surveys
- Orphaned analytics chat sessions
- Snapshot/detail mismatch
- Race conditions during analytics refresh and read
- Large transcript/evidence responses degrading performance

### 4. Public respondent flow for teacher-owned surveys

What this backend feature does:
- Serves public shared survey data, creates or resumes respondent sessions, persists turns, and issues resume links.

API routes:
- `app/api/surveys/respond/[shareableLink]/route.ts`
- `app/api/surveys/respond/[shareableLink]/resume-link/route.ts`
- `app/api/surveys/shared/[shareableLink]/route.ts`
- `app/api/media/surveys/[surveyId]/[mediaId]/route.ts`

Primary backend files:
- `lib/surveys/public-survey-access.ts`
- `lib/surveys/respondent-session-service.ts`
- `lib/surveys/respondent-runtime-service.ts`
- `lib/respondent-conversation.ts`
- `lib/privacy/respondent.ts`
- `lib/ratelimit.ts`

DB-backed behavior:
- Lookup by `shareableLink` or custom slug
- Respondent session creation/resume
- Conversation persistence and completion state
- Resume link generation
- Public media access validation

Inspect first:
- `app/api/surveys/respond/[shareableLink]/route.ts`
- `app/api/surveys/respond/[shareableLink]/resume-link/route.ts`
- `lib/surveys/public-survey-access.ts`
- `lib/surveys/respondent-session-service.ts`

Core invariants:
- Inactive or unauthorized surveys must not be exposed publicly.
- Resume links must only resolve valid respondent sessions.
- Participant count and completion state must stay consistent.
- Rate limits must exist on abuse-prone public endpoints.

Likely bug classes:
- Public data leakage
- Duplicate respondent sessions
- Resume-link misuse
- Inconsistent completion bookkeeping

### 5. Folder organization

What this backend feature does:
- Lets teachers create folders and assign/remove surveys from them.

Server components:
- `app/[locale]/(dashboard)/dashboard/folders/page.tsx`
- `app/[locale]/(dashboard)/dashboard/folders/[folderId]/page.tsx`

Server actions:
- `app/actions/folder.ts`

Primary backend files:
- `lib/server/app-queries.ts`

DB-backed behavior:
- Folder CRUD
- Survey-folder binding and unbinding
- Folder detail reads with completed-response counts

Inspect first:
- `app/actions/folder.ts`
- `lib/server/app-queries.ts`

Core invariants:
- A teacher may only mutate their own folders.
- Survey-folder attachment must stay within the same owner scope.
- Folder delete must detach surveys safely.

Likely bug classes:
- Cross-user folder mutation
- Dangling `folderId`
- Counts not invalidated after mutations

### 6. Classroom creation and student roster management

What this backend feature does:
- Creates classrooms, invites managed students, handles bulk invite, and reads classroom rosters.

Server components:
- `app/[locale]/(dashboard)/dashboard/learning/page.tsx`
- `app/[locale]/(dashboard)/dashboard/learning/reports/page.tsx`

Server actions:
- `app/actions/classroom/classroom-actions.ts`
- `app/actions/classroom/student-actions.ts`
- `app/actions/classroom.ts`

API routes:
- `app/api/learning/classrooms/route.ts`
- `app/api/learning/classrooms/[classroomId]/students/route.ts`
- `app/api/learning/classrooms/[classroomId]/assigned-surveys/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/learning/classroom-service.ts`
- `lib/learning/student-service.ts`
- `lib/learning/teacher-route-access.ts`
- `lib/access/classroom-access.ts`

DB-backed behavior:
- Classroom creation
- Classroom roster reads
- Managed student invitation records
- Assigned survey listing for a classroom

Inspect first:
- `app/actions/classroom/classroom-actions.ts`
- `app/actions/classroom/student-actions.ts`
- `app/api/learning/classrooms/[classroomId]/students/route.ts`
- `lib/learning/classroom-service.ts`
- `lib/learning/student-service.ts`

Core invariants:
- Only the classroom owner can invite or inspect roster data.
- Duplicate invitations or duplicate membership must be prevented.
- Classroom-assigned surveys must only be shown for that classroom.

Likely bug classes:
- Classroom ownership bypass
- Duplicate invitation issuance
- Email normalization mistakes
- Incorrect classroom-scope joins

### 7. Topic management, materials, readiness, reports, and questions

What this backend feature does:
- Creates topics, updates topic status, uploads/materializes topic materials, computes readiness, shows reports, and surfaces out-of-session questions.

Server components:
- `app/[locale]/(dashboard)/dashboard/learning/topics/[topicId]/page.tsx`

Server actions:
- `app/actions/classroom/topic-actions.ts`

API routes:
- `app/api/learning/classrooms/[classroomId]/topics/route.ts`
- `app/api/learning/topics/[topicId]/materials/route.ts`
- `app/api/learning/topics/[topicId]/questions/route.ts`
- `app/api/learning/topics/[topicId]/readiness/route.ts`
- `app/api/learning/topics/[topicId]/reports/route.ts`
- `app/api/media/learning/[materialId]/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/learning/topic-service.ts`
- `lib/learning/materials-route-service.ts`
- `lib/learning/access.ts`
- `lib/learning/reporting.ts`
- `lib/learning/rag.ts`

DB-backed behavior:
- Topic creation and status changes
- Topic material rows and indexing status updates
- Teacher-only material access
- Readiness computation from current topic state and evidence
- Progress-report retrieval
- Retrieval of student out-of-session questions from interactions

Inspect first:
- `app/actions/classroom/topic-actions.ts`
- `app/api/learning/topics/[topicId]/materials/route.ts`
- `app/api/learning/topics/[topicId]/readiness/route.ts`
- `app/api/learning/topics/[topicId]/reports/route.ts`
- `lib/learning/materials-route-service.ts`

Core invariants:
- Only the owning teacher can mutate or inspect topic materials.
- Topic material ingestion/indexing must keep topic boundary metadata in sync.
- Topic status changes must not bypass ownership checks.
- Readiness output must reflect current material set and topic configuration.

Likely bug classes:
- Teacher scope bypass on materials
- Material indexing state desync
- Topic boundary not updated after material changes
- Readiness using stale data

### 8. Teacher interventions and teacher-student chat

What this backend feature does:
- Lets teachers log interventions and ask questions about a student’s learning record via saved teacher chat sessions.

Server component:
- `app/[locale]/(dashboard)/dashboard/learning/students/[studentId]/page.tsx`

Server actions:
- `app/actions/classroom/intervention-actions.ts`
- `app/actions/classroom/tutoring-actions.ts`

API routes:
- `app/api/learning/interventions/route.ts`
- `app/api/learning/students/[studentId]/patterns/route.ts`
- `app/api/learning/students/[studentId]/chat-sessions/route.ts`
- `app/api/learning/students/[studentId]/chat-sessions/[sessionId]/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/learning/intervention-service.ts`
- `lib/learning/evidence.ts`
- `lib/learning/teacher-route-access.ts`
- `lib/learning/storage.ts`

DB-backed behavior:
- Intervention create/update
- Teacher chat session create/update
- Teacher chat history reads
- Student pattern reads
- Student overview data composed from topics, reports, and interactions

Inspect first:
- `app/actions/classroom/intervention-actions.ts`
- `app/actions/classroom/tutoring-actions.ts`
- `app/api/learning/students/[studentId]/chat-sessions/route.ts`
- `lib/learning/evidence.ts`
- `lib/learning/intervention-service.ts`

Core invariants:
- Teacher must own the student/classroom relationship.
- Teacher chat sessions must remain scoped by teacher and classroom student.
- Intervention updates must not be globally mutable by any teacher.

Likely bug classes:
- Missing ownership checks on update flows
- Teacher chat sessions leaking across teachers
- Student evidence hydration using wrong user or membership identity

### 9. Student onboarding and tutoring flow that teacher-owned topics depend on

What this backend feature does:
- Drives managed-student activation, onboarding, tutoring session lifecycle, out-of-session questions, and pattern generation.

Server components:
- `app/[locale]/(dashboard)/dashboard/learning/page.tsx`
- `app/[locale]/student/layout.tsx`
- `app/[locale]/student/dashboard/page.tsx`
- `app/[locale]/student/profile/page.tsx`
- `app/[locale]/student/progress/page.tsx`
- `app/[locale]/student/sessions/page.tsx`

Server actions:
- `completeTutoringSessionAction`
- `askOutOfSessionQuestionAction`

API routes:
- `app/api/learning/onboarding/route.ts`
- `app/api/learning/student-access/activate/route.ts`
- `app/api/learning/me/patterns/route.ts`
- `app/api/learning/topics/[topicId]/chat/route.ts`

Primary backend files:
- `lib/server/app-queries.ts`
- `lib/learning/tutoring-route-orchestrator.ts`
- `lib/learning/tutoring-turn-preparation.ts`
- `lib/learning/tutoring-turn-logging.ts`
- `lib/learning/tutoring-turn-finalization.ts`
- `lib/learning/tutoring-session-lifecycle.ts`
- `lib/learning/onboarding-route-service.ts`
- `lib/learning/student-model-storage.ts`
- `lib/learning/storage.ts`

DB-backed behavior:
- Student access token lookup and activation
- Onboarding state reads and writes
- Tutoring session ensure/load
- Learning message and interaction persistence
- Session completion
- Student model and pattern updates

Inspect first:
- `app/api/learning/topics/[topicId]/chat/route.ts`
- `app/actions/classroom/tutoring-actions.ts`
- `lib/learning/tutoring-turn-finalization.ts`
- `lib/learning/tutoring-session-lifecycle.ts`
- `lib/learning/storage.ts`

Core invariants:
- Student must have valid access to the topic.
- Session ownership must bind to the correct classroom-student membership.
- Assistant turn persistence, interaction logging, state update, and completion must stay consistent.
- Student activation tokens must expire and single-use semantics must hold.

Likely bug classes:
- Session ownership mismatch
- Partial finalization after a failed turn
- Re-activation or replay of student access tokens
- Pattern/model updates applied to wrong student scope

## Expert workflows

### 10. Expert AI ops: guidance packs and few-shot library

What this backend feature does:
- Lets experts/admins create and activate guidance artifacts and manage retrieval-ready few-shot examples.

Server components:
- `app/[locale]/expert/ai-ops/page.tsx`
- `app/[locale]/expert/few-shot/page.tsx`

Server actions:
- `app/actions/ai-ops.ts`

Primary backend files:
- `lib/ai/few-shot-library.ts`
- `lib/learning/expert-eval-storage.ts`

DB-backed behavior:
- Guidance pack create/list
- Guidance version create/activate
- Few-shot example create/list
- Few-shot embedding/indexing kick-off
- Expert eval dataset count lookup

Inspect first:
- `app/actions/ai-ops.ts`
- `lib/ai/few-shot-library.ts`
- `app/[locale]/expert/ai-ops/page.tsx`

Core invariants:
- Only expert/admin users may mutate these assets.
- Activated version must belong to the specified pack.
- Few-shot indexing must not silently fail without review visibility.

Likely bug classes:
- Version activation across the wrong pack
- Missing transactional consistency between version approval and pack activation
- Orphaned few-shot embeddings or stale retrieval metadata

### 11. Expert frameworks, framework versions, and runtime model deployment

What this backend feature does:
- Lets experts create pedagogical frameworks, author versions, activate them, and inspect deployed runtime models.

Server components:
- `app/[locale]/expert/frameworks/page.tsx`
- `app/[locale]/expert/frameworks/[id]/versions/page.tsx`
- `app/[locale]/expert/runtime-models/page.tsx`
- `app/[locale]/expert/runtime-preview/page.tsx`

API routes:
- `app/api/learning/expert/assets/route.ts`
- `app/api/learning/expert/assets/[packId]/versions/route.ts`
- `app/api/learning/expert/assets/[packId]/activate/route.ts`
- `app/api/learning/expert/assets/preview/route.ts`

Primary backend files:
- `lib/learning/expert-access.ts`
- `lib/learning/framework-runtime-storage.ts`
- `lib/learning/framework-packages.ts`
- `lib/learning/storage.ts`
- `lib/learning/rag.ts`
- `lib/learning/session-engine.ts`

DB-backed behavior:
- Framework create/list
- Framework version create/list
- Runtime model synthesis and activation
- Topic ownership/access validation via expert-access helpers
- Preview question generation against topic/framework state

Inspect first:
- `app/api/learning/expert/assets/route.ts`
- `app/api/learning/expert/assets/[packId]/versions/route.ts`
- `app/api/learning/expert/assets/[packId]/activate/route.ts`
- `lib/learning/framework-runtime-storage.ts`
- `lib/learning/expert-access.ts`

Core invariants:
- Expert must only operate on teacher-owned topics/frameworks they are authorized to access.
- Active version and runtime model must stay aligned.
- Activation should not leave framework/version/runtime state partially updated.

Likely bug classes:
- Cross-topic or cross-framework activation mistakes
- Runtime model desync from active framework version
- Preview using the wrong topic/framework state

### 12. Expert QA review, annotation, transcripts, and eval bootstrap

What this backend feature does:
- Lets experts review tutoring sessions, fetch transcripts, read/save annotations, and bootstrap eval datasets.

Server components:
- `app/[locale]/expert/qa/page.tsx`
- `app/[locale]/expert/evals/page.tsx`

API routes:
- `app/api/learning/expert/review-queue/route.ts`
- `app/api/learning/expert/sessions/[sessionId]/transcript/route.ts`
- `app/api/learning/expert/annotations/route.ts`
- `app/api/learning/expert/evals/bootstrap/route.ts`

Primary backend files:
- `lib/learning/expert-route-guard.ts`
- `lib/learning/expert-review-storage.ts`
- `lib/learning/expert-eval-storage.ts`
- `lib/learning/storage.ts`

DB-backed behavior:
- Review queue reads
- Session transcript reads
- Annotation reads and writes
- Review-case creation
- Eval dataset bootstrap

Inspect first:
- `app/api/learning/expert/annotations/route.ts`
- `app/api/learning/expert/review-queue/route.ts`
- `app/api/learning/expert/sessions/[sessionId]/transcript/route.ts`
- `lib/learning/expert-review-storage.ts`
- `lib/learning/expert-eval-storage.ts`

Core invariants:
- Expert session guard must be enforced everywhere.
- Expert annotations must point to valid session/topic/runtime identities.
- Transcript access must never expose non-authorized student/session data.

Likely bug classes:
- Transcript or annotation scope leakage
- Review-case duplication
- Annotation references to stale runtime model IDs

### 13. Expert knowledge inbox and crystallization approval

What this backend feature does:
- Lets experts approve or archive draft crystallized heuristics before they shape runtime behavior.

Server component:
- `app/[locale]/expert/knowledge/page.tsx`

Server actions:
- `app/actions/expert-knowledge.ts`

Primary backend files:
- `lib/learning/types.ts`

DB-backed behavior:
- Draft crystallization list
- Approval updates including approver identity and timestamp
- Rejection/archive updates

Inspect first:
- `app/actions/expert-knowledge.ts`
- `app/[locale]/expert/knowledge/page.tsx`

Core invariants:
- Only expert users may approve/reject.
- Approval should capture approver metadata and final heuristic payload.
- Approved items should be the only ones entering later runtime synthesis.

Likely bug classes:
- Drafts archived or approved without traceability
- UI cache not revalidated after moderation

## Shared operational workflows

### 14. Feedback, notifications, language, auth, and voice support

What this backend feature does:
- Handles feedback submission, notification reads, locale sync, admin-login link request, and voice transcription support.

Server actions:
- `app/actions/notifications.ts`
- `app/actions/translate.ts`
- `app/actions/admin-auth.ts`
- `app/actions/admin.ts`

API routes:
- `app/api/feedback/route.ts`
- `app/api/user/language/sync/route.ts`
- `app/api/voice/transcribe/route.ts`
- `app/api/auth/token/route.ts`
- `app/api/admin/experts/route.ts`
- `app/api/admin-verify/[token]/route.ts`

DB-backed or service-backed behavior:
- Platform feedback reads/writes
- Notification mutation
- User locale mutation
- Admin session-link issuance and verification
- Expert provisioning
- General voice transcription endpoint

Inspect first:
- `app/api/feedback/route.ts`
- `app/actions/notifications.ts`
- `app/actions/translate.ts`
- `app/api/admin/experts/route.ts`
- `app/actions/admin.ts`

Core invariants:
- Notifications must be scoped by user.
- Feedback must correctly associate user and optional classroom-student context.
- Expert provisioning must remain admin-only.
- Voice transcription endpoints must validate uploads and auth.

Likely bug classes:
- Privilege escalation in expert provisioning
- Notification mutation across users
- Locale sync inconsistencies between cookie and DB

## Server-component reads with direct DB access

These pages do not rely solely on `lib/server/app-queries.ts`; they query Drizzle directly and should be reviewed explicitly.

- `app/[locale]/(dashboard)/dashboard/page.tsx`
- `app/[locale]/(dashboard)/dashboard/analytics/page.tsx`
- `app/[locale]/(dashboard)/dashboard/surveys/[surveyId]/analytics/chat/page.tsx`
- `app/[locale]/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/(protected)/manage-users/page.tsx`
- `app/[locale]/expert/ai-ops/page.tsx`
- `app/[locale]/expert/frameworks/page.tsx`
- `app/[locale]/expert/frameworks/[id]/versions/page.tsx`
- `app/[locale]/expert/runtime-models/page.tsx`
- `app/[locale]/student/profile/page.tsx`
- `app/[locale]/student/progress/page.tsx`
- `app/[locale]/student/sessions/page.tsx`

## Recommended review checklist

Use this checklist while doing code review:

1. Verify route/action/page ownership checks at the first backend boundary.
2. Verify all DB writes that should be atomic are actually transactional.
3. Verify cache invalidation exists after every mutation that affects teacher dashboard or expert consoles.
4. Verify role/permission helpers are consistent across page, action, and route layers.
5. Verify status machines:
   - surveys
   - learning topics
   - learning sessions
   - interventions
   - expert framework versions
   - expert crystallizations
6. Verify every client-side fetch target exists in `app/api/**`.
7. Verify all public or semi-public endpoints have either permission checks or rate limits.
8. Verify all “find by id” lookups are scoped by owner/user, not only by raw ID.

## Best files to review first

If you want the shortest path to the highest-signal review:

1. `lib/server/app-queries.ts`
2. `app/actions/survey/survey-lifecycle-actions.ts`
3. `app/actions/classroom/tutoring-actions.ts`
4. `app/api/learning/topics/[topicId]/chat/route.ts`
5. `app/api/surveys/[surveyId]/create/route.ts`
6. `app/api/surveys/respond/[shareableLink]/route.ts`
7. `app/api/learning/expert/assets/[packId]/activate/route.ts`
8. `app/api/learning/expert/annotations/route.ts`
9. `lib/learning/storage.ts`
10. `lib/api/learning.ts`

## Suggested first fixes

These are the most actionable cleanup targets before deeper behavior review:

1. Remove or implement stale `lib/api/learning.ts` route calls.
2. Confirm tutoring turn finalization is atomic across message, interaction, session-state, and completion writes.
3. Review expert framework activation for partial-update risk.
4. Audit all teacher-student access paths for teacher ownership scoping.
5. Review all cached teacher dashboard reads against their mutation invalidation paths.
