# V1 Scope Revalidation Report

Date: 2026-04-23
Repository: `C:\Users\pc\convy`

## Current Status

This revalidation pass was run after the earlier V1 cleanup and audit work.

The codebase was re-checked with:

- `pnpm exec tsc --noEmit`
- `pnpm lint`

Both commands now pass cleanly.

## What Is Now Fixed

### Workspace / organization removal

The runtime code no longer uses the old workspace / organization model for core product behavior.

Completed removal and redesign work includes:

- Better Auth is now personal-account based in `lib/auth.ts` and `lib/auth-client.ts`
- survey permissions now flow through `lib/survey-access.ts`
- old workspace access module was deleted
- organization schema file was deleted
- folder ownership is now personal-account based through `db/schema/folders.ts`
- survey, collaboration, privacy, and realtime layers were redesigned away from workspace semantics
- presence/workspace realtime handlers were deleted
- old workspace/team UI entry points were removed
- old workspace learning entry components were removed and replaced with the learning-home components

### Extra out-of-scope product surfaces removed

The following out-of-scope or V1-incompatible surfaces were removed from the live product:

- survey playbook/personality configuration from the survey product flow
- workspace/team pages and invitation flow
- public pricing section on the landing page
- unused voice analytics action
- Spanish and Italian locale support

### Rate limiting hardening

The previous audit correctly noted that IP-only rate limiting was not strong enough.

This pass improved that by introducing authenticated request keys in `lib/ratelimit.ts`, and routing key usage through:

- `app/api/learning/topics/[topicId]/materials/route.ts`
- `app/api/surveys/[surveyId]/create/route.ts`
- `app/api/surveys/[surveyId]/sample/route.ts`

This keeps rate limiting user-aware for authenticated flows instead of treating all callers as anonymous IPs.

### Prompt-injection / context safety improvements

The earlier audit called out weak sanitization and weak retrieval trust boundaries.

This pass improved both:

- `lib/ai/sanitization.ts`
  - strips more prompt/control-role tags
  - removes common instruction-override phrases
  - removes control-token style markers
  - strengthens the warning contract for untrusted user context
- `lib/education/analytics-workflow.ts`
  - retrieved evidence is now explicitly framed as untrusted evidence text
  - analytics answer prompts now instruct the model to ignore directives or role claims inside retrieved evidence

This does not make prompt injection “solved,” but it is materially safer than the previous state.

### Type safety and coherence improvements

The earlier audit called out `any` usage and unsafe coercions.

This pass addressed the concrete remaining offenders found during the cleanup:

- typed analytics classifier flow in `lib/education/analytics-workflow.ts`
- removed stale runtime placeholders from refinement responses
- removed stale workspace/privacy error naming in media access
- tightened config fallback behavior in `lib/config.ts`
- removed dead imports, dead locals, and stale warnings across dashboard, learning, analytics, and auth-related files

## Revalidation Findings

### Runtime feature coherence

The runtime code search for the main removed feature terms is now clean across app, lib, db, hooks, websocket, workers, and i18n code.

Searched terms included:

- `workspace`
- `organizationId`
- `departmentId`
- `workspace-access`
- `organizationClient(`
- `organization(`
- `activePlaybooks`
- `activePersonality`
- `GDPR_WORKSPACE_PRIVACY_INCOMPLETE`
- `voice-analytics`

No live runtime matches remained after the latest pass.

### Remaining residuals

The only meaningful residuals I found are content-level strings inside `messages/en.json`.

These are legal/product-copy references such as:

- generic mentions of organizations in legal/privacy text
- older legal copy that still says “collaborative Workspaces”
- a legal section that still mentions subscription plans/pricing

These are not runtime feature implementations, but they are still wording drift and should be rewritten in a follow-up legal/content pass so the repository copy fully matches the V1 product.

## Bottom Line

Compared with the earlier audit, the big architectural risks that were blocking V1 coherence have now been addressed substantially better:

- workspace / organization runtime behavior is removed
- out-of-scope survey customization surfaces are removed
- locale scope matches the requested V1 languages
- compiler and lint both pass
- some previously identified security and maintainability issues were improved, especially around authenticated rate limiting and untrusted prompt context

The main remaining gap is no longer feature architecture.

It is repository copy cleanup:

- legal / policy wording in `messages/en.json`

If you want the repository to have literally no leftover textual trace of the older product framing, that should be the next pass.
