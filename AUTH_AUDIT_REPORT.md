# Authentication & Authorization Deep Audit (Expanded)

## Scope
This revision expands the review to the full auth/authz surface you enumerated (core auth modules, auth pages, middleware/websocket gates, permission services, server actions, API routes across surveys/learning/privacy/media/user/feedback, auth DB schema/migration, and auth client/UI components).

Total files read in this pass: **129** (including wildcard route groups and `components/auth/*`).

## Key complexity findings (expanded)

1. **Auth/session types are fragmented with near-duplicate semantics.**
   - `AuthUser`/`AuthSession`/`AuthSessionWithUser` in `lib/auth.ts` and re-shaped session object in `lib/auth/session.ts` create subtle differences (`uiLocale`/`preferredLanguage` optionality and normalization).
   - Consequence: callers must remember nuanced shape differences instead of relying on one canonical auth context type.

2. **Authorization is implemented through multiple non-unified mechanisms.**
   - Observed mixed use of: `getVerifiedSession`, `getCurrentSession`, role assertion helpers, survey permission checks (`lib/survey-access.ts`), route-access wrappers (`lib/surveys/route-access.ts`), and ad-hoc route-local checks.
   - Consequence: policy changes amplify across many files and are easy to miss.

3. **Optimistic middleware check can be mistaken for authoritative guard.**
   - `proxy.ts` uses `session_token` cookie-presence heuristic (fast path), while authoritative checks happen later per endpoint/action.
   - Consequence: high cognitive load and “unknown unknown” risk for future contributors.

4. **Error contract divergence across layers.**
   - Some paths throw stringly-typed `Error("UNAUTHENTICATED")`/`EMAIL_NOT_VERIFIED`; others use permission-specific errors and UX wrappers.
   - Consequence: call sites must translate many variants; behavior consistency is hard to guarantee.

5. **Role source-of-truth split (DB role + env-admin fallback).**
   - `lib/auth/roles.ts` elevates role by `ADMIN_EMAILS` when role not explicitly admin.
   - Consequence: hidden coupling to environment config; harder audits and incident response.

6. **Auth logic and business logic interleaving in route handlers/actions.**
   - Large route modules combine auth checks + resource fetches + domain behavior.
   - Consequence: harder reasoning, larger blast radius per edit.

7. **Auth page flows are distributed across many UI routes/components with partial overlap.**
   - Standard `(auth)` routes + special gated admin-like login subtree + expert and student-access flows.
   - Consequence: onboarding/maintenance complexity and inconsistent failure UX potential.

8. **WebSocket auth flow adds another auth mode and token lifecycle.**
   - `app/api/auth/token/route.ts` issues short-lived Redis ticket; websocket middleware validates/derives auth context.
   - Consequence: additional invariants (TTL, one-time use expectations, mapping correctness) increase system complexity.

9. **Permission model is deep but spread.**
   - Survey permissions and route-level gates are conceptually strong but distributed across utility modules and callers.
   - Consequence: developers must understand many files for one policy change.

10. **Client-side auth wrappers do not fully hide server auth model.**
    - `auth-client` and provider wiring expose auth-library surface and semantics to broader UI.
    - Consequence: information leakage and tighter coupling to Better Auth details.

## Security/correctness findings (selected high impact)

- Middleware cookie-only gate should remain optimization only; never sole authorization.
- Add explicit `server-only` guard to server auth modules.
- Normalize auth error types/contracts for all route/action boundaries.
- Consolidate role authority model (prefer persisted role with explicit bootstrap path).
- Ensure every protected route/action/API uses centralized authoritative session verification close to data access.

## Recommended refactor plan

1. **Create a single auth DAL contract** (`verifySession`, `requireEmailVerified`, `requireRole`, `requireSurveyAccess`) and migrate all route handlers/actions to it.
2. **Introduce one canonical auth context type** consumed everywhere server-side.
3. **Unify auth failure translation** (typed errors -> API/Action response mapper).
4. **Reduce role ambiguity** by removing env-based role elevation after bootstrap migration.
5. **Modularize large handlers** to separate authn/authz boundary from domain operations.
6. **Document middleware as optimistic-only** and codify authoritative checks via lintable conventions.
7. **WebSocket hardening pass** for ticket lifecycle guarantees + consistent auth context mapping.

## Notes
- This document replaces the prior narrower report and focuses on whole-surface complexity and consistency risks.
- No runtime code changes are included in this commit.
