# V1 Scope Audit Report

Date: 2026-04-22
Repository: `C:\Users\pc\convy`

## Purpose

This report documents:

1. The first removal pass for features that are outside the V1 scope you described.
2. The remaining out-of-scope code that is still present in the repository.
3. A production-readiness audit of the in-scope features, with emphasis on AI architecture, auth, security, data modeling, performance, and maintainability.

This report is based on direct code inspection across schema, routes, server actions, library code, and UI files. A full TypeScript verification run could not be completed in this environment because invoking `node`/`tsc` returned `Access is denied`, so the findings below are from static inspection rather than a green build.

## Scope Baseline Used For This Audit

The V1 scope I used came from your description:

- Survey agent
  - conversational survey creation
  - sample conversations with refinement after at least two samples
  - real survey delivery by link and inside classrooms
  - analytics with evolving summaries, qualitative + quantitative outputs, and in-chat charts
  - chat with data
  - raw conversation viewing
  - folders
- Student tutoring
  - classrooms
  - sessions with teaching material and learning outcomes
  - personalization
  - understanding checks
  - teacher and class reporting
- Expert part
  - course selection
  - framework setting
  - session reviews
  - knowledge crystallization / NFD-style improvement loop
  - flagging mechanism
  - student voice input via STT only
- Observability / evals
  - Braintrust
  - Sentry
- Admin
  - users
  - conversation visibility
  - flagged issues
  - user removal
- Platform
  - i18n/l10n for English, French, German
  - logout
  - settings
  - notifications

Anything outside that baseline was treated as a removal candidate for V1.

## What Was Removed In This Pass

This pass removed or trimmed the most visible workspace / collaboration / extra survey-customization surfaces so the product is less misleading at the UI level.

### UI and route removals

- Deleted `components/surveys/personality-controls-panel.tsx`
- Deleted `components/surveys/playbook-studio-panel.tsx`
- Deleted `components/dashboard/workspace-switcher.tsx`
- Deleted `components/dashboard/active-users.tsx`
- Deleted `components/dashboard/workspace-notifications.tsx`
- Deleted `components/surveys/collaboration-sidebar.tsx`
- Deleted `components/dashboard/create-workspace-modal.tsx`
- Deleted `components/dashboard/workspace-create-page.tsx`
- Deleted `app/[locale]/(dashboard)/dashboard/team/page.tsx`
- Deleted `app/[locale]/(dashboard)/dashboard/voice-analytics/page.tsx`
- Deleted `app/[locale]/(dashboard)/dashboard/privacy/page.tsx`
- Deleted `app/[locale]/(dashboard)/dashboard/workspaces/new/page.tsx`
- Deleted `app/[locale]/(auth)/workspace/accept-invitation/[id]/page.tsx`

### Existing UI simplified

- `components/dashboard/dashboard-sidebar.tsx`
  - removed workspace switcher and workspace-specific nav entry points
- `components/dashboard/header.tsx`
  - removed realtime workspace activity widgets
- `app/[locale]/(auth)/sign-up/page.tsx`
  - removed workspace creation mode from sign-up
- `app/[locale]/(dashboard)/dashboard/create/page.tsx`
  - removed collaboration sidebar and workspace-localization dependency from the creation page
- `components/surveys/creator-settings-panel.tsx`
  - removed direct playbook/personality controls from the survey creator UI
- `components/learning/workspace.tsx`
  - removed active workspace dependency
- `components/learning/teacher-workspace.tsx`
  - removed the create-workspace gate and workspace bootstrap dependency

### Public copy cleanup

- `components/features-section.tsx`
- `components/faq-section.tsx`
- `components/pricing-section.tsx`

These were updated so the landing page no longer actively markets workspace/team functionality that is being de-scoped for V1.

### Auth adjustment

- `lib/auth.ts`
  - the organization plugin is still enabled, but invitation email delivery was neutralized to stop sending users into a deleted acceptance flow

Important: this is only a first pass. It reduces visible scope drift, but it does **not** fully remove the workspace / organization feature set from the codebase.

## Out-of-Scope Features Still Present

This is the most important conclusion from the removal audit:

**The workspace / organization model is still deeply embedded in auth, schema, actions, and learning flows. V1 scope cleanup is not complete yet.**

### 1. Workspace / organization is still foundational in auth

- `lib/auth.ts:39-45`
  - Better Auth `organization()` is still enabled.
- `lib/auth-client.ts:8`
  - `organizationClient()` is still enabled client-side.

Why this matters:

- If V1 truly removes workspaces, then auth still exposes the wrong conceptual model.
- This is not just dead code. It affects session semantics, role modeling, invitation flow shape, and future migrations.

### 2. Workspace / department remains in the database schema

Examples:

- `db/schema/organization.ts`
  - organization, departments, department memberships, folder ownership by organization
- `db/schema/surveys.ts:99-144`
  - surveys still carry `organizationId` and `departmentId`
- `db/schema/surveys.ts:479-619`
  - playbooks, personality assignments, refinement threads/proposals, research brief patches
- `db/schema/learning.ts:49-67`
  - classrooms still carry `organizationId` and `departmentId`
- `db/schema/learning.ts:106-132`
  - classroom collaborator / access request tables
- `db/schema/learning.ts` throughout
  - expert frameworks, review cases, interventions, runtime models, student models, media assets all continue to carry `organizationId`

Why this matters:

- V1 removal is not complete until the schema model matches the product model.
- Right now the persistence layer still assumes multi-tenant organization/workspace ownership everywhere.

### 3. Workspace-dependent classroom logic remains active

Examples from `app/actions/classroom.ts`:

- `requireTeachingSession()` and `requireWorkspaceContext()` still enforce workspace semantics
- classroom creation still validates `departmentId`
- classroom language access still depends on workspace locale settings
- collaborator grant / revoke flows still exist
- access request workflow still exists

Representative references:

- `app/actions/classroom.ts:182-193`
- `app/actions/classroom.ts:360-394`
- `app/actions/classroom.ts:418`
- `app/actions/classroom.ts:754-1189`

Why this matters:

- Even after the UI cleanup, the learning product still behaves like a workspace-based product in core server actions.

### 4. Survey playbook / personality / refinement infrastructure still exists

Schema evidence in `db/schema/surveys.ts`:

- `surveyConductingProfiles`
- `surveyPersonalityAssignments`
- `playbooks`
- `playbookVersions`
- `surveyPlaybookAttachments`
- `refinementThreads`
- `refinementMessages`
- `refinementProposals`
- `researchBriefPatches`

API evidence:

- `app/api/surveys/[surveyId]/playbooks/route.ts`
- `app/api/surveys/[surveyId]/playbooks/[playbookId]/route.ts`
- `app/api/surveys/[surveyId]/refinement/route.ts`
- `app/api/surveys/[surveyId]/refinement/proposals/[proposalId]/route.ts`
- `app/api/surveys/[surveyId]/collaboration/bootstrap/route.ts`
- `app/api/surveys/[surveyId]/collaboration/events/route.ts`
- `app/api/surveys/[surveyId]/leases/[stage]/*`

Why this matters:

- Your requested sample-review loop is in scope.
- But the repo still also contains a broader “teacher configures the survey agent with playbooks/personality/collaboration mechanics” system that goes beyond the V1 description.
- I removed the visible settings panels, but the backend feature family is still present.

### 5. Teacher collaboration still leaks into learning UI

Examples:

- `components/learning/teacher-workspace.tsx`
  - collaborator queries and mutations still exist
  - still describes totals “in this workspace”
- `components/learning/teacher-reports-page.tsx`
  - still groups around workspace and departments
- `components/dashboard/invite-member-modal.tsx`
- `components/dashboard/team-member-list.tsx`
- `components/dashboard/academy-unit-modal.tsx`

Why this matters:

- The user experience will continue to expose V1-incompatible concepts unless these are removed or refactored away.

### 6. Workspace privacy / compliance layer is still present

Examples:

- `app/actions/workspace.ts`
- `lib/privacy/*`
- `app/actions/privacy-dashboard.ts`
- `app/[locale]/(dashboard)/dashboard/settings/page.tsx`
  - still has workspace privacy operations and workspace-specific privacy language

Why this matters:

- Some privacy functionality is absolutely good and should stay.
- But the current implementation is still modeled around workspace privacy state instead of a simpler V1 teacher/account/classroom model.

## In-Scope Feature Completeness Audit

Below is a best-effort product-level implementation status after reading the relevant code paths.

### Survey agent

#### Conversational survey creation

Status: **Implemented, but mixed with extra configuration concepts**

What exists:

- creation flow and survey create page
- AI-assisted creation workflow
- research brief and coverage plan machinery

What is not clean yet:

- creation is still entangled with playbooks/refinement/collaboration machinery that exceeds the lean V1 definition

#### Sample survey conversations + conversational refinement

Status: **Largely implemented**

What exists:

- sample conversation route and review page
- refinement assistant flow
- sample review page

Risk:

- the backend implementation is broader than the product description and still exposes extra machinery

#### Real survey delivery

Status: **Implemented**

What exists:

- shareable survey links
- survey response route
- response management
- classroom-linked survey creation exists in learning flow

#### Analytics summary + qualitative/quantitative outputs + chat with data

Status: **Implemented and relatively strong**

What exists:

- analytics snapshots
- evidence extraction
- chart/table tool output in analytics answers
- chat-with-data page
- raw conversation viewing endpoints/pages

Main issue:

- this is one of the stronger areas of the codebase, but it still needs hardening around retrieval trust boundaries, prompt injection resistance, and stronger production observability of retrieval quality.

#### Folders

Status: **Implemented**

But:

- folder-related collaboration/sharing needs to be checked against the V1 scope. Folder grouping itself fits V1. Shared member management around folders may not.

### Student tutoring

#### Classrooms and sessions

Status: **Implemented**

What exists:

- classroom creation
- topic/session-like lesson structures
- material upload
- learning outcomes / topic coverage logic

Risk:

- classroom architecture is still over-coupled to workspace/department concepts

#### Personalization

Status: **Partially implemented**

What exists:

- onboarding
- student patterns
- adaptive retrieval/context in learning flows
- some student model and analysis storage

What is missing or unclear:

- a clearly expressed, end-to-end product implementation of the three-part personalization model you described:
  - motivational context
  - cognitive style calibration over time
  - productive struggle calibration

Pieces exist, but the product model is not yet cleanly assembled around those concepts.

#### Testing understanding and reporting

Status: **Implemented / partially implemented**

What exists:

- readiness checks
- reports
- teacher views
- class-wide and student-level outputs

What still needs strengthening:

- stronger evidence chains from “learning outcome” to “student proved it”
- clearer teacher-facing proof model

### Expert part

Status: **Substantial scaffolding exists, but still maturing**

What exists:

- expert frameworks
- review cases
- crystallization-oriented storage
- expert learning ops admin surfaces

Why this is promising:

- the repo is already moving toward an NFD-style loop rather than only static prompt engineering

Why it is not yet complete:

- the knowledge crystallization lifecycle is structurally present but still coupled to organizational scaffolding and not yet fully productized around the exact expert conversation types you described

### Admin / notifications / settings / localization

Status: **Implemented, with cleanup still needed**

What exists:

- notifications page
- settings page
- admin routes/components
- i18n support across the app

Risk:

- settings still carries workspace/privacy assumptions
- localization support exists, but real translation quality and domain-context consistency need a dedicated QA pass before claiming “perfect and contextual” multilingual support

## Production-Readiness Findings

## 1. RAG quality

### What is good

- `lib/learning/rag.ts`
  - uses hybrid vector + full-text retrieval
  - reranks final candidates
  - stores retrieval-oriented enriched text, not only raw chunks
- `lib/rag/search.ts`
  - combines vector and lexical search
  - uses reciprocal-rank-style fusion
  - adds a HyDE-like expansion step with variant generation

This is materially better than “plain vector search over raw chunks.”

### What is not yet world-class

- The system is still fundamentally a retrieval pipeline built on frozen components.
- It is not an end-to-end retrieval system in the stronger “RAG 2.0” sense discussed by Contextual AI.
- Retrieved chunks are inserted into prompts with weak structural provenance formatting.
- There is no clear evidence of:
  - retrieval quality eval sets
  - automated bad retrieval detection
  - context compression / quote extraction before answer synthesis
  - explicit anti-poisoning or instruction-stripping for retrieved text
  - domain-aware retrieval policies by task type

Relevant code:

- `lib/learning/rag.ts:125-220`
- `lib/rag/search.ts:224-300`

Assessment:

- Stronger than average app-level RAG
- Not yet “world-class”
- Not yet at the reliability bar implied by your requested standard

## 2. Metadata quality in retrieval

### What is good

- `lib/learning/rag.ts:26-45`
  - topic, material title, material kind, subject, grade band, language are embedded into retrieval content
- stored embeddings carry metadata and source identity

### Gaps

- metadata is present, but not consistently exploited as a first-class retrieval policy layer
- there is no visible hard filtering by pedagogical intent, evidence trust level, user role, or answer mode beyond some basic filters
- organization/workspace metadata is still mixed into retrieval scope, which will complicate a cleaner V1 model

Assessment:

- Good direction
- Still not rich enough for the strongest contextual retrieval behavior you want

## 3. Context engineering

### Good signs

- analytics workflows explicitly structure system prompts, evidence digests, playbook context, snapshots, and chart/table tool outputs
- prompt cache namespaces suggest awareness of stable prefix reuse
- some workflows separate system prompt from runtime evidence

### Main issues

- retrieved evidence is still passed in fairly raw text blocks
- evidence formatting is inconsistent across flows
- context selection is sometimes “top N and dump into prompt” rather than “minimal, task-aligned, trust-aware context packing”
- there is no clear sign of KV-cache-aware prompt design beyond provider cache hooks

Assessment:

- Better than naive prompt assembly
- Not yet “right context, right time, right shape” across the whole product

## 4. Prompt caching

### What exists

- `lib/prompt-caching.ts`
  - OpenAI prompt cache key preparation
  - Gemini cached content support
  - Redis coordination for Gemini cached content reuse
- analytics and creation workflows opt into prompt cache namespaces

Examples:

- `lib/education/creation-workflow.ts`
- `lib/education/analytics-workflow.ts:358-361`, `663-666`, `758-761`, `964-967`
- `app/api/surveys/[surveyId]/sample/route.ts`
- `app/api/surveys/respond/[shareableLink]/route.ts`

### Main issues

- cache use is partial, not systematic
- some long-running tutoring and expert flows still need review for cacheability
- the design is provider-aware, but there is no single repo-wide policy for:
  - what should be cached
  - minimum stable prefix size by feature
  - cache hit observability by feature
  - invalidation / drift strategy for evolving static scaffolds

Assessment:

- Good infrastructure
- Incomplete rollout

## 5. Workflow vs agent architecture

### Good

- there is meaningful workflow structure in analytics and creation instead of “one mega prompt”
- the app is not trying to make every feature a fully autonomous agent

### Concerns

- several areas still blur the boundary between deterministic workflow and open-ended agent behavior
- extra survey collaboration / playbook / lease machinery increases orchestration complexity
- some systems appear to be agents in name but are still mostly workflow wrappers with prompt-state accumulation

Assessment:

- better than uncontrolled agent sprawl
- still needs simplification
- the current code would benefit from a more explicit rule: use workflows by default, and reserve agentic control for places where dynamic tool choice genuinely adds value

## 6. Prompt engineering quality

### What is good

- many prompts are task-specific
- several workflows request structured JSON output
- rules are often explicit about grounding and evidence use

### Problems

- some prompts are still verbose but not tightly constrained by a strong schema-first contract
- retrieval content enters prompts with insufficient defensive framing
- there is no obvious unified prompt style guide for:
  - grounded answering
  - refusal conditions
  - evidence citation
  - tool-use policies
  - multilingual behavior

Assessment:

- solid in multiple areas
- uneven across the repo

## 7. SOLID / DRY / KISS

Main concerns:

- some files have grown into large orchestration modules
- some components combine fetching, orchestration, business logic, and rendering
- workspace abstractions are spread across many layers, which increases coupling

Examples:

- `lib/education/analytics-workflow.ts`
- `app/actions/classroom.ts`
- `components/learning/teacher-workspace.tsx`
- `app/[locale]/(dashboard)/dashboard/create/page.tsx`

Assessment:

- There are good modular pockets.
- At the larger feature level, the repo is drifting toward “feature accretion” rather than a consistently minimal architecture.

## 8. Type safety issues

Examples:

- `lib/education/analytics-workflow.ts:446`
  - `survey: any`
- `lib/education/analytics-workflow.ts:777`
  - `classifier: any`
- `app/actions/workspace.ts:483`
  - `as unknown as`
- `lib/config.ts:214`
  - `return envValue as unknown as T`

Assessment:

- These are signs of fighting the type system instead of modeling the real shapes.
- They reduce confidence exactly where correctness matters: orchestration, config, and auth/workspace actions.

## 9. Security and auth

### Auth findings

- Better Auth is implemented, but V1 cleanup is incomplete because organization auth is still active.
- I did not find `trustedOrigins` configured in auth, even though Better Auth explicitly recommends it for CSRF and open redirect protection.
- `requireEmailVerificationOnInvitation` is not configured on the organization plugin, though invitations are still conceptually enabled.

Relevant code:

- `lib/auth.ts`
- `lib/auth-client.ts`

### Prompt injection / model attack findings

- `lib/ai/sanitization.ts` is not strong enough for hostile retrieved content.
- It removes a few tag names and fenced code blocks, then wraps user content with a warning.
- That is helpful, but not a sufficient defense against:
  - indirect prompt injection
  - plain-language instruction smuggling
  - retrieval poisoning
  - malicious content that looks like policy text

### Rate limiting findings

- `lib/ratelimit.ts:66-68`
  - request identity is derived from client IP only for several endpoints
- IP-only rate limiting is not enough for a production multi-tenant app with authenticated users and AI spend risk

Positive note:

- `lib/ai.ts` does apply AI rate limiting using `options.userId` for some model calls, which is better than IP-only at the LLM boundary.

Assessment:

- Better than no controls
- Still not yet production-grade security posture for auth, prompt safety, or abuse resistance

## 10. Caching and stale data risk

What is good:

- prompt caching infrastructure is thoughtful
- query invalidation is used in several React Query flows

What needs attention:

- after workspace removal, cache key strategy should be audited because some keys still implicitly depend on old scope assumptions
- a number of manual `fetch()` flows sit outside a central React Query mutation/query pattern, which raises the risk of stale UI after writes

## 11. React Query usage

What is good:

- React Query is used widely in dashboards, analytics, learning pages, folders, notifications, and student/teacher flows

Examples:

- `components/learning/*`
- `components/analytics/*`
- `components/dashboard/folders/hooks.ts`
- `app/[locale]/(dashboard)/dashboard/notifications/page.tsx`

What is not yet consistent:

- there are still many ad hoc `fetch()` calls in pages/components for create flows, analytics chat, refinement, publish actions, settings, and response pages

Assessment:

- React Query adoption is strong
- not yet universal
- write paths and mutation invalidation should be standardized further

## 12. Performance and file-size issues

High-risk large files / orchestration centers:

- `app/actions/classroom.ts`
- `lib/education/analytics-workflow.ts`
- `components/learning/teacher-workspace.tsx`
- `app/[locale]/(dashboard)/dashboard/create/page.tsx`

Why this matters:

- they are harder to reason about
- they are harder to test
- they increase regression risk when scope changes

## 13. Database quality

### Positive

- the schema includes many indexes, especially around foreign keys and analytics / embedding access paths
- pagination exists in several survey and analytics endpoints

### Main concerns

- the current schema is over-modeled for V1 because organization / department is threaded through many tables
- some concepts look duplicated across survey, learning, expert, and analytics layers instead of being simplified around the V1 product
- there are many opportunities for authorization bugs because access scope is encoded indirectly through organization/classroom/survey joins

I did not confirm a clear N+1 hotspot severe enough to call out as a single blocking issue from the inspected files, but the coupling level means query plans should be reviewed carefully once the V1 schema simplification lands.

## 14. Framework/library usage

### Next.js

- generally follows App Router patterns
- however, some large client components are taking on too much orchestration responsibility

### Vercel AI SDK

- used in a meaningful way for structured outputs, tool-like chart/table payloads, and prompt-cache integration
- overall direction is good
- the repo still needs a stronger repo-wide contract for agent boundaries, prompt packing, and safety

### Better Auth

- installed and functioning
- but still aligned to an organization/workspace model that is no longer consistent with the V1 scope

## 15. Input validation and cleaning

### Good

- Zod is used in several places
- there is active effort toward schema validation

### Gaps

- validation is not uniform across all routes and actions
- sanitization is too weak to be treated as a primary AI safety control
- some flows still rely more on post-hoc parsing than on tight input contracts

## External Standards Consulted

These sources were used as reference points while evaluating the codebase:

- Contextual AI, “Introducing RAG 2.0”
  - https://contextual.ai/research/introducing-rag2
- Anthropic, “Building effective agents”
  - https://www.anthropic.com/engineering/building-effective-agents
- Anthropic prompt caching docs
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Better Auth organization plugin docs
  - https://www.better-auth.com/docs/plugins/organization
- Better Auth security reference
  - https://www.better-auth.com/docs/reference/security

The report above paraphrases the principles from those sources rather than copying them verbatim.

## Priority Recommendations

### P0

1. Finish removing the workspace / organization model from auth, schema, actions, and UI.
2. Remove or redesign survey playbook / personality / collaboration infrastructure that exceeds the V1 product description.
3. Simplify classroom logic so it does not depend on workspace/department semantics.

### P1

1. Harden auth:
   - add `trustedOrigins`
   - review invitation behavior
   - re-check authorization boundaries after schema simplification
2. Harden AI safety:
   - treat retrieved content as hostile by default
   - add stronger prompt-injection mitigation and grounded-answer policies
3. Replace `any` and unsafe assertions in analytics, workspace, and config layers.

### P2

1. Standardize prompt caching rollout and observability by feature.
2. Standardize React Query mutation/query usage for stale-state control.
3. Split large orchestration files into smaller units with clearer contracts.

## Bottom Line

The repo already contains substantial implementation for the product you described, especially in survey analytics, tutoring, expert scaffolding, notifications, and multilingual support. The biggest problem is not “missing everything”; it is **scope drift and architectural overgrowth**.

The current codebase is carrying a larger workspace/collaboration/platform product than your V1 description calls for. Until that model is fully removed from auth, schema, actions, and UI, the product will continue to be harder to secure, harder to maintain, and harder to reason about than it needs to be.
