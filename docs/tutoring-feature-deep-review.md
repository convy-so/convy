# Tutoring Feature Deep Review (Complexity, Design, Bugs)

## Scope used for this review
Because the prompt's file placeholder was not populated, this review used the tutoring feature surface identified in the repo:
- `app/api/learning/**`
- `lib/learning/**`
- `lib/api/learning.ts`
- `components/learning/**`, `components/expert/**`
- `db/schema/learning.ts`

---

## PHASE 1 — System map (read-first, no judgment)

### A) File inventory (condensed by module families)

#### API entrypoints
- `app/api/learning/topics/[topicId]/chat/route.ts`: GET loads/creates tutoring session + history; POST appends user turn, runs runtime prep + model streaming, persists assistant turn, updates session state, optionally completes session.
- `app/api/learning/topics/[topicId]/chat/complete/route.ts`: explicit student completion endpoint.
- `app/api/learning/topics/[topicId]/reports|overview|materials|status|questions|readiness/route.ts`: teacher/student read models and topic operations.
- `app/api/learning/students/[studentId]/*`: patterns/overview/chat and teacher-student chats.
- `app/api/learning/expert/**`: expert assets, review queue, annotations, eval bootstrap, transcript access.
- `app/api/learning/classrooms/**`, `.../invitations/**`, `.../onboarding`, `.../me`: classroom membership/session context and onboarding controls.

#### Core domain services
- `lib/learning/tutoring-route-orchestrator.ts`: student context resolution and session orchestration helpers.
- `lib/learning/tutor-runtime-service.ts`: prepares prompt/runtime inputs and next state.
- `lib/learning/tutoring-prompt-service.ts` + `lib/learning/prompts/*`: prompt composition by scenario.
- `lib/learning/session-engine.ts`, `tutoring-session-lifecycle.ts`: framework progression and completion rules.
- `lib/learning/student-model-service.ts`: snapshot updates from turns.
- `lib/learning/reporting.ts`: report generation flow.
- `lib/learning/storage.ts`: DB persistence primitives.

#### UI/hook layer
- `components/learning/hooks/use-student-learning-workspace.ts`: student workspace query/mutation orchestration.
- `components/learning/hooks/use-teacher-learning-workspace.ts`: teacher dashboard orchestration.
- `components/learning/*`: student/teacher pages/components.
- `components/expert/*`: expert tooling for review/assets/evals.

#### Data model
- `db/schema/learning.ts`: sessions, messages, interactions, student models, reports, expert assets/review entities.

### B) Dependency map (high-signal)
- UI/hooks -> `lib/api/learning.ts` -> `app/api/learning/**`.
- `topics/[topicId]/chat/route.ts` -> orchestrator/runtime/storage/session-lifecycle/student-model/policy/sanitization/AI streaming.
- Domain services -> `lib/learning/storage.ts` -> `db/schema/*` via Drizzle.
- Expert APIs -> expert services + storage for assets/annotations/review queues.

### C) Runtime flow traces

#### Operation 1: Student tutoring turn
1. POST `/api/learning/topics/[topicId]/chat` validates auth + access and onboarding gate.
2. Parses latest user text and scope policy decision.
3. Ensures tutoring session exists and loads prior state.
4. Persists user message + interaction.
5. Prepares runtime turn + dynamic few-shot examples.
6. Streams model output.
7. On finish: persists assistant message + interaction; updates student model snapshot when needed; computes next session state; writes state with optimistic expected version; optionally auto-completes session.

#### Operation 2: Expert feedback integration
1. Expert endpoints accept review/annotations/assets/eval data.
2. Expert data is represented as runtime model/framework/prompt assets.
3. Tutoring runtime pulls active runtime model/prompt assets in prep path.
4. Student turns then execute against updated prompt/runtime artifacts.

### D) State map
- Created: learning session rows, messages, interactions, student model snapshots, expert assets/review objects.
- Read: session + state, topic access/context, prior messages, runtime model/config.
- Mutated: session `state`, `stateVersion`, `sessionStatus`, `summary`; student model snapshot references.
- Destroyed/retired: primarily by status transitions/versioning patterns (not hard deletes in normal turn flow).

---

## PHASE 2 — Findings (complexity/design/bugs)

### FINDING 1: Non-transactional multi-write turn finalization can leave partial state
Type: State Bug  
Severity: High

All locations:
- `app/api/learning/topics/[topicId]/chat/route.ts` lines 307-418
- `lib/learning/storage.ts` lines 221-239, 255-281, 97-125

What the code does:
- In `onFinish`, assistant message insert, interaction insert, optional student model update, session state update, and optional completion each run as separate awaited operations with no DB transaction boundary.

Why it is a problem:
- Mid-sequence failures can persist a subset (e.g., message exists but stateVersion not advanced), causing inconsistent recovery paths and duplicate-processing risks on retries.

Recommendation:
- Introduce a `persistTutorTurnOutcome(...)` transactional unit in `lib/learning/storage.ts` that atomically writes assistant message, interaction, state update, and completion toggle, returning a consolidated result.

---

### FINDING 2: `Date.now()` used for stream message ID can collide across concurrent requests
Type: Edge Case Bug  
Severity: Medium

All locations:
- `app/api/learning/topics/[topicId]/chat/route.ts` line 191

What the code does:
- Creates redirect stream chunk ID as `redirect-${Date.now()}`.

Why it is a problem:
- Two responses in the same millisecond can produce duplicate IDs, which can confuse client-side keyed message assembly.

Recommendation:
- Use `nanoid()`/`crypto.randomUUID()` for stream IDs.

---

### FINDING 3: API route mixes multiple abstraction layers, increasing cognitive load and change amplification
Type: Complexity  
Severity: High

All locations:
- `app/api/learning/topics/[topicId]/chat/route.ts` lines 105-457

What the code does:
- Single route function handles auth/access checks, validation, scope policy, persistence, prompt prep, model invocation, post-processing, lifecycle transitions, telemetry.

Why it is a problem:
- Any change to tutoring turn policy, persistence contract, or telemetry requires edits in this central file; developers must hold end-to-end behavior in memory.

Recommendation:
- Split into deep modules with narrow interfaces:
  - `guardTutoringTurnRequest(...)`
  - `prepareTutoringTurn(...)`
  - `executeTutoringTurnStream(...)`
  - `finalizeTutoringTurn(...)` (transactional)
- Keep route as orchestration-only (~40-70 lines).

---

### FINDING 4: Inconsistent error contract between conflict errors and generic 500 responses
Type: Error Handling Bug  
Severity: Medium

All locations:
- `lib/learning/storage.ts` line 121 (throws generic Error on state conflict)
- `app/api/learning/topics/[topicId]/chat/route.ts` lines 450-455 (maps to generic unhandled error)

What the code does:
- Optimistic conflict throws generic exception; outer catch returns untyped/uniform unhandled error path.

Why it is a problem:
- Client cannot distinguish retryable state-version conflict from real server failure; this creates brittle UX retry logic.

Recommendation:
- Throw typed domain error (e.g., `LearningStateConflictError`) and map to explicit API error code (e.g., `CONFLICT_RETRYABLE`) with deterministic retry guidance.

---

### FINDING 5: Repeated access/onboarding guards across learning routes indicate upward-pushed complexity
Type: Design  
Severity: Medium

All locations:
- `app/api/learning/topics/[topicId]/chat/route.ts` lines 117-126
- Similar pattern appears across `app/api/learning/**` student endpoints (access + profile gate checks)

What the code does:
- Routes individually enforce similar auth/access/profile preconditions.

Why it is a problem:
- Rule updates require touching many files; increased risk of drift where one route misses a guard.

Recommendation:
- Provide a shared guard module returning typed `StudentTutoringContext` and standardized errors; route handlers should consume a single guard call.

---

## Prioritized roadmap

1. **High priority reliability**: transactional tutoring-turn finalization.
   - Files: `lib/learning/storage.ts`, `app/api/learning/topics/[topicId]/chat/route.ts`.
2. **High priority correctness/UX**: typed state-conflict error mapping.
   - Files: `lib/learning/storage.ts`, shared error contract, affected routes.
3. **Medium priority resilience**: replace `Date.now()` IDs with UUIDs.
   - Files: `app/api/learning/topics/[topicId]/chat/route.ts`.
4. **Medium priority design**: extract deep modules from giant chat route.
   - Files: chat route + new domain orchestration modules.
5. **Medium priority complexity**: centralize student access/onboarding guards.
   - Files: multiple `app/api/learning/**` endpoints + new guard utility.
