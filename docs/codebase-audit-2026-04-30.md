# Codebase Audit Report (2026-04-30) — Full Repository Pass

## Scope & Method
- I performed a repository-wide static audit across application/runtime code (`app`, `lib`, `db`, `workers`, `websocket`, `i18n`, `messages`, `hooks`, `components` integration boundaries).
- Deployment/config-only artifacts were intentionally excluded from analysis per instruction.
- UI component internals (rendering/styling) were not analyzed; only server/component integration seams were.
- Evidence was gathered from direct code reads plus cross-repo searches for auth checks, redirects, env access, dead-code hints, and server-action usage patterns.

---

## REPORT PART 1 — SYSTEM ARCHITECTURE MAP

### Major subsystems
1. **Web Application (Next.js App Router)**
   - Route handlers in `app/api/**` for tutoring, surveys, learning, privacy, auth, media.
   - Localized app routes in `app/[locale]/**` with role-specific sections (dashboard/admin/expert/public survey response).
2. **Learning/Tutoring Domain**
   - Core service modules in `lib/learning/**` (runtime, prompts, state machines, storage adapters, lifecycle).
3. **Survey Domain**
   - Creation/conducting/analytics flows in `lib/education/**` with APIs under `app/api/surveys/**`.
4. **AI Infrastructure Layer**
   - Model/runtime utilities in `lib/ai/**`, generalized core in `lib/ai-core/**`, RAG helpers in `lib/rag/**`.
5. **Database Layer**
   - Drizzle schema definitions in `db/schema/**` with cross-domain entities (auth, surveys, learning, feedback, privacy, vectors).
6. **Background Workers**
   - Worker bootstrap and worker registrations in `workers/index.ts`; domain workers for survey analytics, tutoring reports, email, translation.
7. **WebSocket Server**
   - Standalone realtime/voice server in `websocket/server.ts` with auth middleware and handler-based routing.
8. **Internationalization Layer**
   - Locale routing + runtime resolution in `i18n/*` and `lib/i18n/*`, with static catalogs in `messages/{en,fr,de}.json`.

### Data flows
- **Tutoring**: Student request → `app/api/learning/topics/[topicId]/chat/route.ts` → access + session state/storage + tutor runtime service + AI prompting → session/message persistence.
- **Survey creation**: Author request → `app/api/surveys/[surveyId]/create/route.ts` → permission + lease/revision checks + workflow orchestration + persisted conversation state.
- **Voice survey response**: WebSocket connect → `websocket/server.ts` route split → auth/rate-limit middleware → voice handlers → redis-backed realtime pub/sub.
- **Async analytics/reporting**: App enqueues/background triggers → workers consume queues → update survey/tutoring artifacts + optional notifications.

### Two key execution paths
1. **Tutoring Session**
   - Student hits tutoring chat endpoint, session is verified, student/topic access is validated, active session is created/fetched, state is initialized or advanced via runtime service, message + interaction data are stored.
2. **Survey Completion/Creation Journey**
   - Authorized actor enters survey creation endpoint, lease and revision consistency are validated, messages normalized, creation workflow invoked, and state persisted for subsequent continuation.

### Worker/WebSocket roles
- Workers offload long-running or asynchronous tasks from request lifecycle.
- WebSocket server handles low-latency voice/realtime event flows with dedicated middleware and connection lifecycle cleanup.

---

## REPORT PART 2 — TUTORING FEATURE AUDIT

### 1) Student Path
**Execution path (observed):**
- Entrypoint route: `app/api/learning/topics/[topicId]/chat/route.ts`.
- Auth/access checks: `getVerifiedSession`, `getStudentTopicAccess`.
- Session bootstrap: `ensureTutoringSession` (creates session, appends opening message, logs interaction).
- Runtime preparation: `tutorRuntimeService.initializeSessionState` / `prepareTurn`.

**Findings**
- `[SOLID]` Explicit actor/auth checks and onboarding gate are in-route before tutoring operations.
- `[DEBT]` Route-level orchestrator is broad (policy + lifecycle + persistence + AI prep), increasing cognitive load and test surface.
- `[DEBT]` Error responses are mostly generic (`400`) on catch, limiting diagnosis quality at API boundary.

### 2) Teacher Path
**Observed role:**
- Teacher workflows are primarily classroom/topic orchestration, reporting, and supervision; tutoring-turn execution remains student-session centric.

**Findings**
- `[DEBT]` Teacher vs student separation exists at access seam, but lifecycle/state operations are heavily shared through common storage/service abstractions, so behavioral boundaries are implicit rather than interface-isolated.

### 3) Expert Path
**Execution path (observed):**
- Expert queue endpoint: `app/api/learning/expert/review-queue/route.ts`.
- Authorization: `assertAiOpsUser` before queue retrieval.

**Findings**
- `[SOLID]` Privileged operations include explicit authorization in same handler.
- `[DEBT]` Expert flows appear distributed across multiple API routes and modules; seam contracts are primarily implicit function boundaries.

### 4) AI Pipeline Deep Dive
**RAG / prompting / runtime observations:**
- Runtime preparation consolidates student model + framework state + content scope and then builds system prompt.
- Prompt assembly is centralized through tutoring prompt service modules.

**Findings**
- `[SOLID]` Session state schemas provide structured validation during runtime transitions.
- `[DEBT]` Token-budget enforcement is present in shared AI utilities, but not consistently obvious at all top-level route entry points.
- `[DEBT]` Empty/weak retrieval context handling risks plausible-but-low-grounded outputs.

### 5) Actor Interaction Map
- **Student**: primary tutoring session actor.
- **Teacher**: manages educational context and reviews outcomes.
- **Expert**: review/evaluation and specialized curation workflows.
- **Shared state seam**: learning session state and interaction logs in DB.

---

## REPORT PART 3 — SURVEY FEATURE AUDIT

### Actor flows
- **Creator/Teacher/Admin-like actor** uses `app/api/surveys/[surveyId]/create/route.ts` for iterative survey construction.
- **Respondent path** includes public response routes + resume links + conversation persistence.
- **Analytics actor path** includes survey analytics endpoints and background analytics worker support.

### Findings
- `[SOLID]` Creation route enforces lease and revision conflict controls, reducing write races.
- `[SOLID]` Endpoint-level rate limiting included on high-churn POST route.
- `[DEBT]` Survey API layer has large handler files combining permission, state management, AI orchestration, and response shaping.
- **Workflow classification**: deterministic workflows dominate; control flow remains code-driven rather than LLM-decided.

---

## REPORT PART 4 — INTERNATIONALIZATION AUDIT

### 1) Architecture
- Static locale catalogs exist for all three target locales in `messages/en.json`, `messages/fr.json`, `messages/de.json`.
- Locale resolution/routing helpers exist in `i18n/*` and `lib/i18n/*`.
- Runtime AI-assisted dynamic translation helpers exist (`lib/i18n/ai-translator.ts`, `lib/i18n/dynamic-translations.ts`).

### 2) Static vs Dynamic translation
- **Static**: message JSON catalogs consumed through locale infrastructure.
- **Dynamic**: runtime translation/cache helpers for generated/content-driven text.

### 3) Coverage & consistency
- `[SOLID]` Triplet locale files are present.
- `[DEBT]` Mixed static + dynamic pathways can drift unless keys/fallback behavior and precedence are standardized.

### 4) Red flags
- Potential inconsistency tax where identical concepts appear across static and dynamic translation paths.

---

## REPORT PART 5 — SOFTWARE DESIGN FINDINGS (Lens A & B)

1. `[DEBT]` **Cognitive Load / Shallow orchestration modules**  
   - **Location**: major route handlers in `app/api/learning/**`, `app/api/surveys/**`.  
   - **What**: handlers combine auth, validation, orchestration, persistence, and AI wiring.  
   - **Why it matters**: increased blast radius and harder isolated testing.

2. `[SOLID]` **Boundary enforcement at privileged seams**  
   - **Location**: expert/admin-protected routes (example: expert review queue).  
   - **What**: explicit role checks in same request function.

3. `[DEBT]` **Dependency direction pressure**  
   - **Location**: app routes directly importing infra-heavy modules (DB + AI + collaboration).  
   - **What**: framework layer often doubles as application service layer.

4. `[MVP-OVERKILL]` **Potential over-segmentation risk if fully inverted now**  
   - **What**: full clean-architecture inversion for all flows would likely overfit current MVP constraints.

---

## REPORT PART 6 — AI & AGENTIC SYSTEM FINDINGS (Lens C)

### Workflow classification
- Tutoring and survey creation flows are predominantly **deterministic workflows**.
- No clear evidence of open-ended autonomous tool-selection loops as primary control mechanism.

### Failure mode analysis (top 3 silent risks)
1. Weak retrieval context can still produce coherent but weakly grounded answers.
2. Generic catch-to-HTTP mapping can hide whether failure was model, retrieval, policy, or persistence.
3. In mixed locale flows, dynamic translation can subtly alter prompt semantics across turns.

### Additional findings
- `[DEBT]` Observability is present in pieces (e.g., tracing/log utilities), but end-to-end AI debugging consistency is not uniformly obvious from route boundary.

---

## REPORT PART 7 — DEAD CODE INVENTORY

| Category | File Path | Dead Element | Evidence | Recommendation |
|---|---|---|---|---|
| Deprecated Redirect Page | `app/[locale]/expert/page.tsx` | Whole page behavior | Redirect-only pattern to `/expert/qa` | Remove after confirming no external deep links |
| Deprecated Redirect Page | `app/[locale]/expert/frameworks/page.tsx` | Whole page behavior | Redirect-only behavior | Merge/remove with route migration notes |
| Deprecated Redirect Page | `app/[locale]/expert/knowledge/page.tsx` | Whole page behavior | Redirect-only behavior | Remove if no independent SEO/entry need |
| Deprecated Redirect Page | `app/[locale]/expert/prompts/page.tsx` | Whole page behavior | Redirect-only behavior | Remove after compatibility check |
| Commented-out code | `db/schema/surveys.ts` | `SurveyImage` alias comment | Explicit removed-refactor residue comment | Delete stale comment once no rollback need |
| Legacy note | `websocket/handlers/base-voice-agent-handler.ts` | Legacy audio config handling branch | In-code legacy annotation | Retain only if backward compatibility still required |

---

## REPORT PART 8 — OTHER FINDINGS (Lens E)

1. **Error handling strategy**
   - `[DEBT]` Inconsistent error response style across routes (`NextResponse.json`, plain `Response`, varied payload shape).

2. **Type safety**
   - `[SOLID]` Broad Zod usage and typed schemas in key flows.
   - `[DEBT]` Some normalization helpers must defensively coerce unknown/record shapes; hotspots should be tracked.

3. **Auth at seams**
   - `[SOLID]` Most critical routes inspected perform explicit auth/permission checks.

4. **Environment management**
   - `[DEBT]` `lib/env` centralization exists, but direct `process.env` usage still appears in server/worker/bootstrap and some libs.

5. **Inconsistency tax**
   - `[DEBT]` Similar operations (error mapping, response shaping, and AI call wrapping) are implemented differently across domains.

---

## REPORT PART 9 — CODEBASE NAVIGATION GUIDE

### Mental model first
1. Tutoring Session lifecycle and session state transitions.
2. Survey lifecycle (creation → conducting/respondent → analytics).
3. Actor boundaries (Student, Teacher, Expert) and permission seams.
4. Async execution model (request path vs workers vs websocket realtime path).
5. i18n split (static catalogs + dynamic translation utilities).

### Reading order (recommended)
1. `db/schema/learning.ts`, `db/schema/surveys.ts`, `db/schema/relations.ts`
2. `app/api/learning/topics/[topicId]/chat/route.ts`
3. `lib/learning/tutor-runtime-service.ts`, `lib/learning/session-engine.ts`, `lib/learning/prompting.ts`
4. `app/api/surveys/[surveyId]/create/route.ts`
5. `lib/education/creation-workflow.ts`, `lib/education/conducting-runtime.ts`, `lib/education/analytics-workflow.ts`
6. `websocket/server.ts` + `websocket/handlers/*`
7. `workers/index.ts` + each worker module
8. `i18n/*`, `lib/i18n/*`, `messages/*`

### Load-bearing files (high leverage)
- `app/api/learning/topics/[topicId]/chat/route.ts`
- `lib/learning/tutor-runtime-service.ts`
- `lib/learning/tutoring-session-lifecycle.ts`
- `lib/learning/storage.ts`
- `app/api/surveys/[surveyId]/create/route.ts`
- `lib/education/creation-workflow.ts`
- `lib/education/conducting-runtime.ts`
- `lib/education/analytics-workflow.ts`
- `db/schema/learning.ts`
- `db/schema/surveys.ts`
- `websocket/server.ts`
- `workers/index.ts`
- `lib/env.ts`

### Common traps
1. Files that look “simple routes” but are actually orchestration-heavy.
2. Redirect-only pages that appear feature-bearing by path name.
3. Shared service calls across actors that obscure role boundaries.
4. Mixed static/dynamic translation paths creating hidden output differences.
5. Generic catch blocks masking root cause category.

### Orientation landmarks
- Most high-value flows are API-route orchestrators + domain service chains.
- Domain state is schema-driven and increasingly validated with Zod.
- AI integrations are mostly deterministic pipelines with explicit function sequencing.

---

## REPORT PART 10 — STRATEGIC RECOMMENDATIONS

### NOW (MVP-active)
1. Extract route orchestration into narrow application services for tutoring and survey create/respond endpoints.
2. Standardize API error contract and status mapping with shared helpers.
3. Define one policy for token/context budgeting enforcement at top-level AI entry points.
4. Normalize permission-check idioms to reduce auth drift at new seams.
5. Remove/retire confirmed redirect-only legacy pages after link telemetry check.

### LATER (post-MVP)
1. `[MVP-OVERKILL]` Full dependency inversion around every domain boundary.
2. `[MVP-OVERKILL]` Unified end-to-end trace graph for all AI + websocket + worker operations with structured cost dashboards.
3. `[MVP-OVERKILL]` Formal interface contracts for all cross-process shared modules (web app/workers/websocket).
