# Backend Invariants And Bugs Explained

Purpose: explain the invariants and likely bug classes from `docs/backend-feature-review-map.md` in more detail, with execution paths, code references, and short source snippets.

Reviewed on: 2026-05-14

## What was fixed during this pass

`lib/api/learning.ts` contained stale mutation helpers that called removed or unsupported route handlers.

Removed helpers:

- `acceptClassroomInvitation`
- `rejectClassroomInvitation`
- `createClassroom`
- `inviteStudent`
- `inviteStudentsBulk`
- `createTopic`
- `createLearningIntervention`
- `updateLearningIntervention`
- `updateTopicStatus`

Why this was correct:

- those helpers were not used by the active teacher UI
- the active teacher UI already uses server actions from `app/actions/classroom.ts`
- several of those helpers were calling routes that either do not exist or only implement `GET`

Files changed:

- `lib/api/learning.ts`

Validation:

- `pnpm exec tsc --noEmit`

Additional fixes applied in this pass:

- intervention update now validates classroom ownership before writing
- intervention creation now validates that the selected student and topic belong to the selected classroom
- invitation acceptance is now transactional, so invitation state and membership creation stay consistent
- expert framework activation now publishes version, activates framework, and creates the runtime model in one transaction
- default framework bootstrap in `ensureTopicFramework` is now atomic across framework, version, and active-version update

## How to read this file

For each workflow, this doc includes:

- execution path
- invariant meaning
- why it matters
- concrete code references
- confirmed issues or review risks

I use these labels:

- Confirmed issue: visible directly in current code
- Review risk: plausible problem class that still deserves explicit review

## 1. Teacher dashboard shell and role scoping

Primary files:

- `app/[locale]/(dashboard)/layout.tsx`
- `lib/server/app-queries.ts`
- `lib/auth/dal.ts`

Execution path:

1. Teacher enters a dashboard route.
2. `app/[locale]/(dashboard)/layout.tsx` loads the current session.
3. It resolves `getPlatformRole(session.user)`.
4. If the role is `student`, it redirects away from the teacher dashboard.
5. It then loads `getLearningMeData()` and `getNotificationsForCurrentUser()` from `lib/server/app-queries.ts`.

Key snippet:

```ts
if (session?.user) {
  const role = getPlatformRole(session.user);
  if (role === "student") {
    redirect(`/${locale}/student/dashboard`);
  }
}
```

Invariant:

- students must never receive teacher dashboard data

Why it matters:

- the layout is the top-level server boundary for most teacher pages
- if this fails, every nested dashboard page is exposed behind the wrong shell

Review risk:

- role drift between page-level gating and query-level gating

What to verify:

- no teacher-only data is loaded before the student redirect
- every server query under the dashboard still scopes by the signed-in user

## 2. Survey permissions and lifecycle transitions

Primary files:

- `app/actions/survey/shared.ts`
- `app/actions/survey/survey-lifecycle-actions.ts`
- `lib/survey-access.ts`

Execution path for publish:

1. Client calls `publishSurveyAction`.
2. `requireSurveyActionSession()` loads the signed-in user.
3. `requireSurveyWithPermission()` loads the survey and permission context.
4. The action loads the research brief and coverage plan.
5. It optionally promotes the active sample conducting profile into the live profile.
6. It updates the `surveys` row to `active`.
7. It invalidates caches.

Key permission snippet:

```ts
const survey = await requireSurveyRecord(params.surveyId);
const permission = await getSurveyPermissionForSession(params.session, survey.id);
assertPermission(hasSurveyPermission(permission, params.capability), params.message);
```

Key transition snippet:

```ts
assertState(!!briefRow && !!planRow, "The education brief is not ready yet.");
assertState(briefRow.missingFields.length === 0, "The brief is incomplete.");
```

Invariant:

- only permitted users may mutate a survey
- publishing must only happen after the creation pipeline produced valid brief and plan state

Why it matters:

- survey lifecycle is the core teacher-owned content pipeline
- if transition guards are weak, active public surveys can be created from incomplete internal state

Review risk:

- status transition holes between `draft`, `creating`, `sample_review`, `active`, `completed`, `paused`

What to verify:

- every action checks capability through `requireSurveyWithPermission`
- no route bypasses the action permission model
- active surveys always have the internal prerequisites expected by analytics/respondent code

## 3. Dashboard cache invalidation after survey mutations

Primary files:

- `app/actions/survey/shared.ts`
- `lib/cache.ts`
- `app/[locale]/(dashboard)/dashboard/page.tsx`

Execution path:

1. A survey action mutates the database.
2. It calls `invalidateSurveyCaches`.
3. `invalidateSurveyCaches` calls `invalidateDashboardCaches` and `revalidatePath("/", "layout")`.
4. Teacher dashboard queries later rebuild their cached sections.

Key snippet:

```ts
export async function invalidateSurveyCaches(userId: string, tags?: DashboardCacheSection[]) {
  await invalidateDashboardCaches(userId, null, tags);
  revalidatePath("/", "layout");
}
```

Invariant:

- dashboard summary data must be refreshed after any mutation that affects it

Why it matters:

- the dashboard page reads cached survey counts and recent survey/activity lists
- stale caches create false review signals because UI state stops matching DB state

Review risk:

- missed invalidation on less common mutations such as duplicate, reactivate, or publish

What to verify:

- every action that changes dashboard-visible state invalidates the correct sections
- no query depends on a cache key that the mutation never clears

## 4. Public respondent access control

Primary files:

- `app/api/surveys/respond/[shareableLink]/route.ts`
- `app/api/media/surveys/[surveyId]/[mediaId]/route.ts`
- `lib/surveys/public-survey-access.ts`
- `lib/privacy/respondent.ts`

Execution path for public GET:

1. Route resolves the survey by shareable link.
2. It checks classroom-assigned constraints through `resolveClassroomAssignedAccess`.
3. It checks respondent token/session access through `resolveRespondentAccess`.
4. If an existing conversation is authorized, it resumes it.
5. Otherwise it may create a new conversation.

Key snippet:

```ts
const surveyResult = await fetchActiveSurveyByShareableLink(shareableLink);
const access = await resolveClassroomAssignedAccess(survey);
const authorizedAccess = await resolveRespondentAccess({
  cookieHeader: request.headers.get("cookie"),
  surveyId: survey.id,
  explicitToken: resumeToken,
  sessionAllowedScopes: ["respondent_session"],
  explicitAllowedScopes: ["respondent_resume"],
  clientIp: getClientIP(request),
});
```

Execution path for media:

1. Route finds the survey and the requested media item.
2. It checks normal teacher/editor survey permission.
3. If normal permission fails, it falls back to respondent token/session validation.
4. Only then does it mint a signed media URL.

Key snippet:

```ts
if (!hasSurveyPermission(permission, "canView")) {
  const tokenRecord = await resolveRespondentAccess({ ... });
  if (!tokenRecord) {
    return apiError("UNAUTHORIZED", "Unauthorized");
  }
}
```

Invariant:

- public endpoints must not expose survey content or media without valid survey access or respondent access

Why it matters:

- these are the least trusted entry points in the system
- a weak access check here would leak live teacher-authored survey assets

Review risk:

- respondent token misuse
- classroom-assigned participant mismatch
- signed URL issuance without full access validation

What to verify:

- respondent tokens are scoped tightly enough
- conversation ownership is checked on resume
- participant limits cannot be bypassed via repeated first-turn races

## 5. Classroom ownership for teacher-student operations

Primary files:

- `lib/learning/teacher-route-access.ts`
- `lib/access/classroom-access.ts`
- `app/api/learning/students/[studentId]/patterns/route.ts`
- `app/api/learning/students/[studentId]/chat-sessions/route.ts`
- `app/actions/classroom/tutoring-actions.ts`

Execution path:

1. Teacher attempts a student-specific read or mutation.
2. Backend resolves the classroom-student membership.
3. It checks whether the teacher owns the membership’s classroom.
4. Only then does it return data or continue the write path.

Key snippet:

```ts
const membership = await getDb().query.classroomStudents.findFirst({
  where: (table, { eq }) => eq(table.id, input.classroomStudentId),
  with: { classroom: true },
});

const access = await getTeacherClassroomAccess(
  input.teacherUserId,
  membership.classroomId,
);
```

Invariant:

- every teacher-student operation must be scoped through teacher ownership of the classroom

Why it matters:

- student patterns, progress, interactions, and teacher chat history are sensitive education records

Review risk:

- any route that accepts `classroomStudentId` or `sessionId` but fails to re-bind it to teacher ownership

What to verify:

- no student-specific query uses only raw `studentId` without ownership validation
- teacher chat session reads and writes also scope on `userId`

## 6. Topic status and intervention mutations moved to server actions

Primary files:

- `components/learning/hooks/use-teacher-learning-workspace.ts`
- `app/actions/classroom/topic-actions.ts`
- `app/actions/classroom/intervention-actions.ts`
- `lib/api/learning.ts`

Execution path:

1. Teacher UI no longer mutates topic/intervention state through `/api/learning/...` mutation endpoints.
2. It now calls `updateTopicStatusAction` and `updateLearningInterventionAction` directly.
3. Reads still flow through `lib/api/learning.ts`.

Key snippet:

```ts
const result = await updateTopicStatusAction({ topicId, status });
const result = await updateLearningInterventionAction(input);
```

Invariant:

- the active frontend/backend contract must match the actual route and action surface

Why it matters:

- stale helper layers silently rot and mislead future review or development work

Confirmed issue:

- `lib/api/learning.ts` still contained dead mutation helpers for routes that no longer existed or no longer supported those methods

Fix made:

- removed the dead helpers from `lib/api/learning.ts`

## 7. Intervention update ownership gap

Primary files:

- `app/actions/classroom/intervention-actions.ts`
- `lib/learning/intervention-service.ts`

Execution path:

1. Teacher calls `updateLearningInterventionAction`.
2. The action validates the payload and calls `requireTeachingSession()`.
3. It now loads the intervention before updating.
4. It checks classroom ownership for that intervention.
5. It delegates to `InterventionService.updateIntervention`.
6. The service binds the update by both `interventionId` and `classroomId`.

Action snippet:

```ts
export async function updateLearningInterventionAction(input: unknown) {
  const body = validateInput(input, learningInterventionUpdateSchema);
  const { session } = await requireTeachingSession();
  const intervention = await InterventionService.getInterventionById(body.interventionId);
  await ensureClassroomOwnerAccess(session.user.id, intervention.classroomId);
  const result = await InterventionService.updateIntervention({
    ...body,
    classroomId: intervention.classroomId,
  });
}
```

Service snippet:

```ts
const [record] = await getDb()
  .update(learningInterventions)
  .set({ ... })
  .where(
    and(
      eq(learningInterventions.id, params.interventionId),
      eq(learningInterventions.classroomId, params.classroomId),
    ),
  )
  .returning();
```

Why this mattered:

- the old path proved the caller was a teacher, but not that the teacher owned the target classroom/intervention
- if a teacher obtained another intervention ID, the old update path had no visible ownership guard

Classification:

- Confirmed issue at review time

Fix applied in current working tree:

- load the intervention first
- validate classroom ownership before the write
- bind the update by both intervention ID and classroom ID for defense in depth

Related fix:

- intervention creation now verifies `classroomStudentId` belongs to `classroomId`
- it also verifies `topicId`, when present, belongs to the same classroom

Why that matters:

- classroom ownership alone was not enough if the payload could point at a student or topic outside the classroom

## 7A. Invitation acceptance atomicity

Primary files:

- `app/actions/classroom/student-actions.ts`
- `lib/learning/student-service.ts`

Execution path:

1. Signed-in user calls `respondToInvitationAction`.
2. The action validates payload and forwards to `StudentService.respondToInvitation`.
3. The service validates invitation state and email ownership.
4. It now updates the invitation and creates the classroom membership inside one transaction.

Key snippet:

```ts
await getDb().transaction(async (tx) => {
  const [updatedInvitation] = await tx
    .update(classroomInvitations)
    .set({ status: params.decision, ... })
    .where(and(
      eq(classroomInvitations.id, params.invitationId),
      eq(classroomInvitations.status, PENDING_INVITE_STATUS),
    ))
    .returning();

  if (params.decision === "accepted" && !existingMembership) {
    await tx.insert(classroomStudents).values({ ... });
  }
});
```

Why this mattered:

- in the old flow, the invitation could be marked accepted before membership creation failed
- that would leave the system with a consumed invitation but no actual classroom membership

Classification:

- Confirmed issue at review time

Fix applied in current working tree:

- invitation state update and membership creation are now atomic

## 8. Tutoring session ownership and session reuse

Primary files:

- `app/api/learning/topics/[topicId]/chat/route.ts`
- `lib/learning/tutoring-route-orchestrator.ts`

Execution path:

1. Route authenticates the student.
2. `resolveStudentTutoringContext` loads access and study language.
3. `ensureTutoringSession` first checks the requested session ID.
4. It only reuses that session if topic, classroom-student membership, session type, and locale all match.
5. Otherwise it looks for an existing active tutoring session with the same identity.
6. If none exists, it initializes a new session and logs the opening tutor turn.

Key snippet:

```ts
const existing =
  (requestedSession &&
   requestedSession.sessionStatus === "active" &&
   requestedSession.sessionType === "tutoring" &&
   requestedSession.topicId === input.topicId &&
   requestedSession.classroomStudentId === input.access.classroomStudent.id &&
   requestedSession.sessionLocale === input.studyLanguage
    ? requestedSession
    : null) ?? ...
```

Invariant:

- a tutoring session may only be reused if it still belongs to the same student membership, topic, type, and locale

Why it matters:

- without this, one student could accidentally or maliciously attach to another session record

Review risk:

- duplicated session openings if concurrent requests race before the first session is visible

What to verify:

- if concurrency becomes a problem, session creation may need stronger uniqueness or a transaction/constraint strategy

## 9. Tutoring turn consistency and optimistic state versioning

Primary files:

- `app/api/learning/topics/[topicId]/chat/route.ts`
- `lib/learning/tutoring-turn-finalization.ts`
- `lib/learning/storage.ts`
- `lib/learning/tutoring-session-lifecycle.ts`

Execution path:

1. Route validates the student and topic.
2. It extracts the latest user text.
3. It evaluates tutoring scope.
4. It logs the user turn.
5. It prepares the tutor turn.
6. It streams the model response.
7. `onFinish` calls `finalizeTutoringTurn`.
8. `finalizeTutoringTurn` computes the next state and calls `persistTutorTurnOutcome`.
9. `persistTutorTurnOutcome` writes assistant message, assistant interaction, and session state in one DB transaction.
10. If the framework is complete, `finalizeTutoringSession` then marks the session completed and enqueues report generation.

Key route snippet:

```ts
await logUserTurn({ ... });
const { previousAssistant, prepared, fewShotExamples, tools, sanitizedMessages } =
  await prepareTutoringTurn({ ... });
return await streamAgentResponse(..., {
  onFinish: async (result) => {
    await finalizeTutoringTurn({ ... });
  },
});
```

Key transaction snippet:

```ts
return await getDb().transaction(async (tx) => {
  await tx.insert(learningMessages).values({ ... });
  await tx.insert(learningInteractions).values({ ... });
  const [session] = await tx
    .update(learningSessions)
    .set({
      state: params.nextState,
      stateVersion: params.expectedStateVersion + 1,
    })
    .where(
      and(
        eq(learningSessions.id, params.sessionId),
        eq(learningSessions.stateVersion, params.expectedStateVersion),
      ),
    )
    .returning();
});
```

Invariant:

- assistant message persistence, assistant interaction logging, and session state advance must stay atomic

Why it matters:

- this is the integrity boundary for every tutoring turn

What improved compared with the earlier stale review notes:

- turn persistence is now transactional through `persistTutorTurnOutcome`
- state version conflict throws `LearningStateConflictError`

Remaining review risk:

- completion and report enqueue happen after the turn transaction, not inside the same transaction boundary

Why that still matters:

- a turn may be persisted successfully while completion/report queueing fails afterward
- that is smaller than the older risk, but still worth reviewing

## 10. Expert framework activation

Primary files:

- `app/api/learning/expert/frameworks/[frameworkId]/activate/route.ts`
- `lib/learning/framework-runtime-storage.ts`

Execution path:

1. Expert session is validated.
2. Framework ownership is resolved via `getExpertAccessibleFramework`.
3. Target version is loaded from `expertFrameworkVersions`.
4. Placeholder and empty-content guards reject auto-seeded or blank frameworks.
5. In one transaction: version row is updated to `published`, framework row is updated with `activeVersionId`.
6. The response returns `frameworkId` and `versionId`.

Key snippet:

```ts
await getDb().transaction(async (tx) => {
  await tx
    .update(expertFrameworkVersions)
    .set({ status: "published", publishedAt: new Date(), publishedByUserId: session.user.id, ... })
    .where(eq(expertFrameworkVersions.id, version.id));

  await tx
    .update(expertFrameworks)
    .set({ activeVersionId: version.id, ... })
    .where(eq(expertFrameworks.id, framework.id));
});
```

Invariant:

- version publish and framework `activeVersionId` update must be atomic — both succeed or neither does

Why it matters:

- `getTopicFramework` in `framework-runtime-storage.ts` resolves the active framework version at tutor-turn time by reading `activeVersionId`
- if version is published but `activeVersionId` is not yet set (or vice-versa), the tutor runtime uses the wrong instructions

Note on `expertRuntimeModels`:

- this table no longer exists in the schema
- the runtime model is assembled on demand from the published framework version at tutoring time, not pre-materialized into a separate table
- any documentation or code references to `expertRuntimeModels` as an active table are stale and should be removed

Fix applied in current working tree:

- version publish and framework `activeVersionId` update are inside one database transaction
- placeholder-guard and empty-content-guard added before the transaction to reject uncommitted framework drafts

Related fix:

- `ensureTopicFramework` now creates the default framework, default version, and `activeVersionId` update inside one transaction

## 11. Expert review annotation scoping

Primary files:

- `app/api/learning/expert/annotations/route.ts`
- `lib/learning/expert-route-guard.ts`
- `lib/learning/expert-access.ts`

Execution path:

1. Route requires an expert session.
2. `resolveTeacherExpertAnchor` resolves a valid topic/student/session/interaction anchor.
3. For framework-specific annotations, the route loads the tutoring session.
4. It reads `runtimeModelId` out of `sessionRecord.state`.
5. It uses that to derive `frameworkVersionId`.
6. It creates a review case, then may create a draft crystallization.

Key snippet:

```ts
const sessionRecord = await getDb().query.learningSessions.findFirst({
  where: eq(learningSessions.id, anchor.sessionId),
});

const runtimeModelId = sessionRecord?.state?.runtimeModelId;
```

Invariant:

- annotations must be attached to the correct educational anchor and, when framework-specific, to the correct framework version

Why it matters:

- expert corrections become reusable artifacts
- if the framework linkage is wrong, later runtime behavior can be trained on the wrong failure source

Review risk:

- stale or missing `runtimeModelId` in session state causing framework-specific annotations to degrade to weaker linkage than intended

What to verify:

- every tutoring session reliably records `runtimeModelId`
- expert-access helpers fully constrain which topics/sessions an expert may annotate

## 12. Survey analytics and response detail permission gating

Primary files:

- `lib/server/app-queries.ts`
- `app/api/surveys/[surveyId]/analytics/route.ts`
- `app/api/surveys/[surveyId]/responses/[responseId]/route.ts`

Execution path for server-rendered response detail:

1. Page calls `getSurveyResponseDetailData`.
2. That loads the signed-in session.
3. It loads the survey.
4. It resolves survey permission through `getSurveyPermissionForSession`.
5. It only then loads survey sessions, turns, evidence, and coverage plan state.

Key snippet:

```ts
const permission = await getSurveyPermissionForSession(session, surveyId);
if (!hasSurveyPermission(permission, "canView")) {
  throw new Error("Unauthorized");
}
```

Invariant:

- response transcripts, evidence, and analytics detail must only be viewable with `canView`

Why it matters:

- these routes expose the richest post-response data in the survey system

Review risk:

- any alternative route that loads session detail before permission resolution

What to verify:

- the same permission model is used by both server components and API routes

## 13. Student activation token integrity

Primary files:

- `app/api/learning/student-access/activate/route.ts`
- `lib/learning/tokens.ts`

Execution path:

1. GET validates a token and previews the classroom/student context.
2. POST validates token + activation payload.
3. Backend creates or links the user account and activates the classroom-student record in one flow.

Invariant:

- activation tokens must be valid, scoped, and non-replayable

Why it matters:

- this is the first trust boundary for managed student onboarding

Review risk:

- replay or partial activation if token consumption and membership update are not tightly coupled

What to verify:

- token lookup and consumption happen transactionally
- expired tokens are rejected before account mutation

## 14. Current learning client contract after cleanup

Primary files:

- `lib/api/learning.ts`
- `components/learning/hooks/use-teacher-learning-workspace.ts`
- `app/actions/classroom.ts`

Current split after the fix:

- reads remain in `lib/api/learning.ts`
- teacher mutations now live in server actions:
  - classroom creation
  - student invite
  - topic creation
  - topic status update
  - intervention create/update
  - teacher-student chat persistence

Why this matters for future review:

- if someone reintroduces route-based mutation helpers in `lib/api/learning.ts`, they should first verify the matching `app/api/learning/**` route really exists and supports that method

## Recommended next code-review targets

If you want to continue from this file directly, inspect these next:

1. `app/actions/classroom/intervention-actions.ts`
2. `lib/learning/intervention-service.ts`
3. `app/api/learning/expert/frameworks/[frameworkId]/activate/route.ts`
4. `lib/learning/framework-runtime-storage.ts`
5. `app/api/learning/topics/[topicId]/chat/route.ts`
6. `lib/learning/tutoring-turn-finalization.ts`
7. `lib/server/app-queries.ts`
8. `app/actions/survey/survey-lifecycle-actions.ts`
