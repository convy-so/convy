# Teacher + Expert AI Pattern Audit

Scope: teacher and expert features only. Student/admin code was ignored except where teacher/expert flows persist into shared tables.

Update status:
- The findings in this document were used as the implementation checklist for the current working tree.
- Teacher findings `T1` through `T9` are fixed in code.
- Expert findings `E1` through `E8` are fixed in code.
- Keep the sections below as audit history and regression targets during human review.

Method:
- traced each feature from page/component entry point to server action or API route, then into service/storage and schema
- classified findings against the cleanup guide patterns the user provided
- flagged only issues I could tie to concrete code paths in the current repo

Severity legend:
- High: authorization, broken feature path, or inconsistent persisted state
- Medium: latent logic bug, stale state, data-shape weakness, or avoidable operational risk
- Low: dead scaffold, misleading fallback, or maintainability smell with real review value

## Coverage Map

### Teacher features audited
- Dashboard shell and quick actions
- Survey creation
- Sample review and publish
- Survey detail and lifecycle controls
- Survey analytics and response review
- Folder views
- Learning hub
- Classroom creation and invitations
- Topic creation and topic detail
- Student detail and teacher copilot chat
- Interventions and reports

### Expert features audited
- Expert auth gate
- AI Ops guidance packs and versions
- Few-shot example authoring and retrieval
- Framework library
- Framework version drafting and activation
- Runtime preview
- QA review queue, transcript review, and annotation creation
- Knowledge inbox and crystallization approval
- Runtime model listing and eval entry points

## Teacher Findings

### T1. Broken dashboard quick action points to a route that does not exist
Severity: High

Patterns:
- Pattern 14: dead code and unreachable branches
- Pattern 20: misleading UI affordance

Path:
- `app/[locale]/(dashboard)/dashboard/page.tsx:63`
- user clicks dashboard quick action
- Next `Link` navigates to `/dashboard/learning/create`
- there is no matching page for that route in the current app tree

Evidence:
```ts
{
  title: t("QuickActions.CreateLearningTopic.Title"),
  href: "/dashboard/learning/create",
}
```

Why this matters:
- this is a teacher-facing dead path on the main dashboard
- it creates a false feature surface during review because the UI suggests a topic-creation route that the router does not serve

Review note:
- this is not just naming drift; it is a real broken entry point

### T2. `requireTeachingSession()` does not enforce a teacher role
Severity: High

Patterns:
- Framework step 7: authorization and trust boundaries
- Pattern 7: cargo-cult naming that implies more than the code does

Path:
- `app/actions/classroom/shared.ts:15-18`
- `app/actions/classroom/classroom-actions.ts:23-39`
- teacher classroom creation UI eventually calls `createClassroomAction`
- action calls `requireTeachingSession()`
- helper only checks `getVerifiedSession()`, then returns the session
- action writes a classroom using `session.user.id` as `teacherUserId`

Evidence:
```ts
export async function requireTeachingSession() {
  const session = await getVerifiedSession();
  if (!session) throw new UnauthorizedError();
  return { session };
}
```

```ts
const { session } = await requireTeachingSession();
const result = await ClassroomService.createClassroom({
  teacherUserId: session.user.id,
  ...
});
```

Why this matters:
- the name says "teacher" but the implementation means "authenticated user"
- for actions that later call `ensureClassroomOwnerAccess`, the owner check narrows the blast radius
- `createClassroomAction` is different: there is no pre-existing classroom ownership check, so the role boundary depends entirely on this helper

What to verify in human review:
- whether any authenticated non-teacher can reach this server action
- whether platform policy actually intends classroom creation to be teacher-only

### T3. Topic creation accepts unvalidated JSON through `z.any()`
Severity: Medium

Patterns:
- Pattern 16: unsafe type handling / missing runtime validation
- Pattern 21: type-safety escape hatch

Path:
- topic creation UI
- `createLearningTopicAction`
- `ClassroomService.createTopic(...)`
- `learningTopics.sourceBoundary` and `learningTopics.learningOutcomes` persist to JSONB

Evidence:
```ts
const createTopicSchema = z.object({
  ...
  learningOutcomes: z.array(z.any()).min(1),
  sourceBoundary: z.any().optional(),
});
```

Schema side:
- `db/schema/learning.ts:129` `learningTopics`
- `sourceBoundary` is `jsonb<TopicSourceBoundary>`
- `learningOutcomes` is `jsonb<LearningOutcomeDefinition[]>`

Why this matters:
- the database and downstream code assume structured domain objects
- the action boundary does not enforce that structure
- malformed topic data can pass the action, persist successfully, then fail later in tutor runtime, topic reports, or expert review logic

### T4. Survey creation page silently drops into a blank draft flow on load failure
Severity: Medium

Patterns:
- Pattern 1: happy-path-only failure handling
- Pattern 8: shallow error handling

Path:
- `app/[locale]/(dashboard)/dashboard/create/page.tsx:26-37`
- page receives `surveyId`
- tries to load creation state + survey details in parallel
- any failure is swallowed
- page resets all initial props to `null`
- UI renders as if there were no existing draft

Evidence:
```ts
try {
  [initialCreationState, initialSurveyData] = await Promise.all([
    getSurveyCreationInitialData(requestedSurveyId),
    getSurveyDetailsData(requestedSurveyId),
  ]);
  initialSurveyId = requestedSurveyId;
} catch {
  initialSurveyId = null;
  initialCreationState = null;
  initialSurveyData = null;
}
```

Why this matters:
- unauthorized, not-found, query failure, and transient backend failure all collapse into the same “start fresh” outcome
- that can hide real bugs and can mislead a teacher into thinking an existing draft disappeared

### T5. Survey creation chat transport still references a removed API route
Severity: Medium

Patterns:
- Pattern 2: hallucinated/deprecated API surface
- Pattern 14: dead integration path

Path:
- `components/surveys/pages/create-survey-page-client.tsx:144-157`
- `useChat` initializes a `DefaultChatTransport`
- default `api` is `/api/surveys/create-draft`
- request-preparation hook later rewrites to `/api/surveys/${sid}/create` only after a draft id exists

Evidence:
```ts
transport: new DefaultChatTransport({
  api: "/api/surveys/create-draft",
  ...
  prepareSendMessagesRequest: async ({ api, ... }) => {
    const sid = surveyIdRef.current;
    return {
      api: sid ? `/api/surveys/${sid}/create` : api,
      ...
    };
  },
})
```

Why this matters:
- the happy path probably avoids the removed endpoint by calling `ensureDraftExists()` first
- the fallback path is still stale and would fail if a message is sent before the draft handshake succeeds
- this is exactly the kind of “looks plausible, breaks only off-path” issue that AI-generated integrations produce

### T6. Survey activation logic is duplicated and behaviorally inconsistent
Severity: High

Patterns:
- Pattern 19: duplicate business logic
- Framework step 5: business rule completeness

Paths:
- detail page path: `SurveyDetailPageClient` can call `confirmSurveyAction`
- sample review path: `SampleReviewPageClient` publishes via `publishSurveyAction`

Evidence from lifecycle actions:
```ts
export async function confirmSurveyAction(surveyId: string) {
  ...
  assertState(
    survey.status === "sample_review" || survey.status === "draft",
    ...
  );
  const shareableLink = survey.shareableLink ?? `survey-${nanoid(12)}`;
  await getDb().update(surveys).set({
    status: "active",
    shareableLink,
  })
}
```

```ts
export async function publishSurveyAction(input: unknown) {
  ...
  const shareableLink = survey.shareableLink ?? nanoid(10);
  const title = body.title?.trim() || briefRow.brief.title;
  const description = body.description?.trim() || briefRow.brief.learningContext;
  await getDb().update(surveys).set({
    status: "active",
    shareableLink,
    title,
    description,
    coreObjective: briefRow.brief.researchGoal,
    programId: briefRow.programId,
    isVoice: body.isVoice ?? survey.isVoice,
    updatedAt: new Date(),
  })
}
```

Why this matters:
- both paths produce `status = active`
- only `publishSurveyAction` applies richer publish-time side effects and prerequisites
- the teacher can reach materially different persisted survey state depending on which UI path they used

What to verify in human review:
- whether `confirmSurveyAction` is legacy and should be removed
- whether any active-survey assumptions rely on fields only `publishSurveyAction` hydrates

### T7. Custom slug actions update DB state without invalidating survey caches
Severity: Medium

Patterns:
- Pattern 1: invisible failure path for derived state
- Framework step 9: ordering and sequencing assumptions

Path:
- survey detail/settings UI
- `setSurveyCustomSlugAction` or `clearSurveyCustomSlugAction`
- DB update succeeds
- server-rendered and cached survey listings/details may continue to show stale public URLs

Evidence:
- `updateSurveyAction` calls `invalidateSurveyCaches(session.user.id)`
- `setSurveyCustomSlugAction` and `clearSurveyCustomSlugAction` do not

Code reference:
- `app/actions/survey/survey-settings-actions.ts:74-75`
- `app/actions/survey/survey-settings-actions.ts:85-166`

Why this matters:
- URL settings are externally visible output
- the mutation succeeds but cache-dependent pages may lag behind, which is hard to diagnose because there is no explicit failure

### T8. Teacher copilot chat persistence can fail after the assistant reply is already rendered
Severity: Low

Patterns:
- Pattern 1: partial-success flow
- Framework step 6: end-to-end data flow drift

Path:
- `components/learning/teacher-student-chat.tsx`
- user submits question
- `answerTeacherStudentQuestionAction` returns answer
- assistant message is appended locally
- `persistSession(nextMessages)` runs afterward
- if persistence fails, catch block appends an error message to the in-memory transcript

Evidence:
```ts
const nextMessages = [...optimisticMessages, assistantMessage];
setMessages(nextMessages);
await persistSession(nextMessages);
```

Why this matters:
- the visible transcript and the saved transcript can diverge
- “recent chats” may not include the latest exchange even though the user saw it rendered
- this is not catastrophic, but it is a real end-to-end consistency smell in a teacher-facing evidence workflow

### T9. `PublishSurveyModal` contains placeholder async logic rather than a real title-generation path
Severity: Low

Patterns:
- Pattern 7: cargo-cult scaffolding
- Pattern 20: TODO without an implemented boundary

Path:
- `components/surveys/publish-survey-modal.tsx`
- teacher clicks title suggestion control
- code sleeps for one second and hardcodes `"Customer Satisfaction Survey"`

Evidence:
```ts
// TODO: Call AI to suggest title based on survey data
await new Promise(resolve => setTimeout(resolve, 1000));
setTitle("Customer Satisfaction Survey");
```

Why this matters:
- this is not a runtime bug in the narrow sense
- it is misleading scaffolding in a teacher workflow and should be treated as non-production logic during review

## Expert Findings

### E1. AI Ops page loads guidance versions with an N+1 query pattern
Severity: Medium

Patterns:
- Pattern 9: excessive/redundant I/O

Path:
- `app/[locale]/expert/ai-ops/page.tsx`
- page loads all guidance packs
- then runs one `findMany` query per pack to load versions

Evidence:
```ts
const versionsEntries = await Promise.all(
  packs.map(async (pack) => {
    const versions = await getDb().query.expertGuidanceVersions.findMany({
      where: eq(expertGuidanceVersions.packId, pack.id),
      orderBy: [desc(expertGuidanceVersions.version)],
    });
    return [pack.id, versions] as const;
  }),
);
```

Why this matters:
- page cost grows linearly with pack count
- this is manageable when there are few packs, but AI Ops is exactly the kind of back-office feature that accretes history

### E2. Guidance-version activation is non-atomic
Severity: Medium

Patterns:
- Pattern 11: race conditions and missing concurrency guards
- Framework step 8: partial success at external/storage boundaries

Path:
- `components/expert/expert-ai-ops-console.tsx`
- `activateExpertGuidanceVersion(...)`
- version row updated
- pack row updated separately

Evidence:
```ts
await getDb()
  .update(expertGuidanceVersions)
  .set({ status: "approved", updatedAt: new Date() })
  .where(eq(expertGuidanceVersions.id, input.versionId));

await getDb()
  .update(expertGuidancePacks)
  .set({
    activeVersionId: input.versionId,
    status: "approved",
    updatedAt: new Date(),
  })
  .where(eq(expertGuidancePacks.id, input.packId));
```

Why this matters:
- a failure between the two writes leaves the system in a split state
- readers may observe an approved version without the pack pointing to it, or vice versa

### E3. Few-shot example creation can succeed in the DB and still fail overall
Severity: Medium

Patterns:
- Pattern 1: happy-path-only external dependency handling
- Framework step 8: partial success

Path:
- `components/expert/few-shot-manager.tsx`
- `createExpertFewShotExample(...)`
- insert row into `few_shot_examples`
- immediately call `indexFewShotExample(...)`
- if indexing throws, action returns an error even though the row already exists

Evidence:
```ts
const [example] = await getDb()
  .insert(fewShotExamples)
  .values({ ... })
  .returning();

await indexFewShotExample({
  id: example.id,
  feature: input.feature,
  tags: input.tags,
  content: input.content,
});
```

Why this matters:
- the expert UI experiences a failed create
- the database may now contain an example without complete retrieval/index state
- retrying from the UI risks duplicates

### E4. Few-shot retrieval masks all retrieval failures by returning an empty list
Severity: Medium

Patterns:
- Pattern 1: happy-path-only implementation
- Pattern 8: shallow/invisible failure surface

Path:
- expert-authored few-shot examples are later read through `lib/ai/few-shot-library.ts`
- any failure in vector search, reranking, hydration, or SQL assembly is caught
- function logs and returns `[]`

Evidence:
```ts
} catch (error) {
  log.error("Retrieval failed", {
    feature,
    ...serializeError(error),
  });
  return [];
}
```

Why this matters:
- downstream tutor behavior degrades silently instead of surfacing a distinct operational fault
- this makes expert interventions appear ineffective when the actual problem is retrieval infrastructure

### E5. Few-shot hydration uses raw SQL string assembly for id ordering
Severity: Low

Patterns:
- Pattern 7: cargo-cult low-level query construction
- general brittleness smell in a core expert retrieval path

Path:
- `lib/ai/few-shot-library.ts:195-200`
- reranker returns ids
- code builds `ANY(ARRAY[...])` using `sql.raw(...)` and manual quoting

Evidence:
```ts
sql`${fewShotExamples.id} = ANY(ARRAY[${sql.raw(
  finalIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","),
)}])`
```

Why this matters:
- the code is doing manual SQL literal assembly in a path that otherwise uses typed query helpers
- escaping is present, so this is not being flagged as a confirmed injection bug
- it is still harder to reason about and easier to regress than a parameterized helper

### E6. Expert authoring UIs parse JSON and cast it without schema validation
Severity: Medium

Patterns:
- Pattern 16: unsafe type assertions and missing runtime validation

Paths:
- `components/expert/expert-ai-ops-console.tsx:138-146`
- `components/expert/expert-framework-version-studio.tsx:65-73`
- `components/expert/few-shot-manager.tsx:56-65`

Evidence:
```ts
artifact = JSON.parse(artifactJson) as Record<string, unknown>;
```

```ts
const artifact = JSON.parse(artifactJson) as Record<string, unknown>;
```

```ts
parsedContent = JSON.parse(contentJson);
```

Why this matters:
- “valid JSON” is not the same as “valid guidance artifact” or “valid framework”
- malformed expert-authored payloads can get deeper into storage and runtime than they should
- one route does validate framework artifacts on the server (`expertFrameworkSchema`), but the client flows remain loosely typed and inconsistent

### E7. Framework version numbering has a race window
Severity: Medium

Patterns:
- Pattern 11: race conditions and missing concurrency guards

Path:
- `components/expert/expert-framework-version-studio.tsx`
- POST `/api/learning/expert/frameworks/[frameworkId]/versions`
- route reads current latest version
- increments in application code
- inserts new version row

Evidence:
```ts
const existing = await getDb().query.expertFrameworkVersions.findMany({
  where: eq(expertFrameworkVersions.frameworkId, framework.id),
  orderBy: (table, { desc }) => [desc(table.version)],
  limit: 1,
});
const versionNumber = (existing[0]?.version ?? 0) + 1;
```

Why this matters:
- concurrent requests can compute the same `versionNumber`
- the unique constraint will protect the table, but the route does not retry or return a domain-specific conflict response

### E8. Expert knowledge approval actions trust TypeScript types without runtime input validation
Severity: Low

Patterns:
- Pattern 16: missing runtime validation at the boundary

Path:
- `app/actions/expert-knowledge.ts`
- `approveCrystallization(params)` and `rejectCrystallization(id)` accept direct inputs
- no `zod` parse or explicit runtime guard exists before DB update

Evidence:
```ts
export async function approveCrystallization(params: {
  id: string;
  title: string;
  heuristic: ExpertHeuristic;
  relevanceScope: string;
  notes?: string;
})
```

Why this matters:
- in ordinary UI usage the client probably sends well-shaped data
- from a security/review perspective, these are still mutation boundaries
- they should be audited like any other teacher/expert write path

## Schema and Type Smells Worth Special Attention

These are not always direct bugs, but they are concentrated risk zones in teacher/expert flows.

### Teacher-side schema/type smells
- `db/schema/learning.ts:129` `learningTopics.sourceBoundary` and `learningOutcomes` are JSONB-heavy domain fields. The action boundary currently uses `z.any`.
- `db/schema/learning.ts:457` `teacherStudentChatSessions.messages` stores raw arrays of `{ parts?: Array<Record<string, unknown>> }`, which makes downstream interpretation loose.
- `db/schema/surveys.ts:87` `surveys.folderId` maps to the DB column `project_id`. That is naming drift in a teacher-facing organizational feature.

### Expert-side schema/type smells
- `db/schema/ai.ts:45` `expertGuidanceVersions.artifact` is stored as `jsonb<Record<string, unknown>>`.
- `db/schema/ai.ts:74` `fewShotExamples.content` is also `jsonb<Record<string, unknown>>`.
- `db/schema/learning.ts:583` `expertFrameworkVersions.framework` is a JSONB blob carrying a large domain object. This is acceptable, but it raises the bar for validation and versioning discipline.

## Features With No New High-Signal Findings In This Pass

I still traced these paths, but I did not find a stronger teacher/expert-only issue than the ones above:
- teacher folders
- teacher analytics page shell
- expert runtime model listing page
- expert evals page shell

That does not mean they are perfect. It means they did not surface a clearer AI-pattern or logical-bug finding than the items already listed.

## Recommended Review Order

1. Teacher survey publish/confirm path
2. Teacher classroom action auth boundary
3. Teacher topic creation validation
4. Expert few-shot create/retrieve path
5. Expert framework version create/activate path
6. Expert AI Ops page query shape
