# Repo Type Audit

Date: 2026-06-24

## Scope

This audit covered every code-bearing file in the repo that matched:

- `*.ts`
- `*.tsx`
- `*.js`
- `*.mjs`
- `*.cjs`

Excluded:

- `node_modules`
- `.git`
- `.next`
- `dist`
- `coverage`
- `out`
- `build`

Total files scanned: `737`

## Repo-Wide Signals

These are raw pattern counts across the whole codebase. They are useful signals, not direct bug counts.

- `as const`: `234`
- `true as const` / `false as const`: `52`
- type assertions using `as ...`: `635`
- `as unknown as ...`: concentrated in survey runtime orchestration
- `unknown`: `640`
- `Record<string, unknown>`: `237`
- string index signatures: `9`
- non-null access `!.`: `24`
- `@ts-ignore`: `0`
- `@ts-expect-error`: `0`

Important correction:

- A naive first-pass regex suggested `14` `any` hits.
- Direct verification showed those were comment/string matches, not real type-level `any`.
- Real `any` usage in code is effectively `0`.

## What Is Good

These are not smells and should not be targeted blindly.

- Query key tuples in [shared/http/query-keys.ts](/C:/Users/pc/convy/shared/http/query-keys.ts:1) use `as const` correctly. This preserves tuple literals for React Query keys.
- Discriminant-style action/page-data returns such as `success: true as const` or `completed: false as const` in [shared/http/page-data/student-learning-page-data.ts](/C:/Users/pc/convy/shared/http/page-data/student-learning-page-data.ts:1) are justified. They create stable tagged unions.
- Runtime coercion of raw SQL rows in [app/actions/admin.ts](/C:/Users/pc/convy/app/actions/admin.ts:1) is a good boundary pattern. `Record<string, unknown>` is used there because `execute()` returns untyped row bags.
- Narrowing helpers around unknown profile data in [features/tutoring/ui/student-profile-page.tsx](/C:/Users/pc/convy/features/tutoring/ui/student-profile-page.tsx:1) are healthy examples of using the type system instead of escaping it.
- Catch clauses generally use `error instanceof Error ? error.message : String(error)`, which is the correct `unknown`-style handling pattern.
- The codebase has no `@ts-ignore` or `@ts-expect-error`, which is a strong positive signal.

## Confirmed Smells

### 1. Assertion-Driven Orchestration Instead Of Typed Domain Inputs

This is the most serious smell found in the audit.

Primary hotspot:

- [features/surveys/server/respondent-runtime-service.ts](/C:/Users/pc/convy/features/surveys/server/respondent-runtime-service.ts:1)

Symptoms:

- Input fields are accepted as `unknown`.
- The function immediately rebuilds local structure with chains like:
  - `params.brief as { brief: unknown }`
  - `sessionRow.sessionState as unknown as Parameters<typeof resolveActiveCoverageNode>[0]`
  - `brief.brief as Parameters<typeof planConductingTurn>[0]["brief"]`
  - `canonicalTurn.originalMessages as UIMessage[]`

Why this is a smell:

- The code is not letting TypeScript represent the real domain model.
- It is using downstream function signatures as a type source through `Parameters<typeof ...>`, which is brittle and hard to read.
- Every refactor of a callee signature can silently ripple through these assertions.
- This is a classic case of fighting the type system instead of modeling the data once and carrying strong types through.

What should exist instead:

- Explicit named types for the orchestration input shape.
- A validated transformation step at the boundary.
- Strongly typed local variables after validation, with no repeated `as Parameters<typeof ...>` casting.

### 2. Nullable State Objects Forcing Non-Null Assertions

Primary hotspot:

- [features/surveys/realtime/survey-response-voice.ts](/C:/Users/pc/convy/features/surveys/realtime/survey-response-voice.ts:1)

Symptoms:

- State is initialized with many nullable fields:
  - `survey: null`
  - `brief: null`
  - `coveragePlan: null`
  - `sessionId: null`
  - `sessionState: null`
- Later methods rely on `this.state.survey!` repeatedly after initialization checks.

Why this is a smell:

- The runtime has phase information, but the type model does not.
- TypeScript cannot prove that later code runs only after initialization, so the file falls back to `!`.
- This usually means the state should be a discriminated union such as `uninitialized | ready | closed`, not one wide partially-null object.

What should exist instead:

- A phase-based state union or a narrower `ReadyResponseState`.
- Methods that only accept/use ready state after a guard.

### 3. Cargo-Cult Boolean Literal Assertions

Primary hotspot:

- [shared/http/page-data/workspace-shell-page-data.ts](/C:/Users/pc/convy/shared/http/page-data/workspace-shell-page-data.ts:93)

Examples:

- `canEditMetadata: true as const`
- `canOrganizeSurveys: true as const`
- `canDelete: true as const`
- `isSharedFolder: false as const`

Why this is a smell:

- These are not discriminants.
- They do not express a meaningful union.
- They mostly freeze booleans to satisfy current object literal structure instead of modeling permissions or folder variants properly.

Important distinction:

- `success: true as const` and similar result tags are often fine.
- Plain feature/permission flags as `true as const` are usually unnecessary and make the code look more type-clever than it is.

### 4. Repeated JSON Bag Types Instead Of Domain Shapes

Primary hotspots:

- [shared/db/schema/learning.ts](/C:/Users/pc/convy/shared/db/schema/learning.ts:1)
- [app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx](/C:/Users/pc/convy/app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx:1)
- [features/tutoring/ui/student-profile-page.tsx](/C:/Users/pc/convy/features/tutoring/ui/student-profile-page.tsx:1)
- [shared/ui/chart.tsx](/C:/Users/pc/convy/shared/ui/chart.tsx:1)

Symptoms:

- Many `jsonb` fields are typed as `Record<string, unknown>`.
- Message `parts`, `metadata`, `analysis`, and similar structures are widely treated as generic bags.
- UI code then re-parses them manually with repeated `typeof` and `Array.isArray` checks.

Why this is a smell:

- `Record<string, unknown>` is acceptable at a boundary.
- It becomes a smell when it leaks far past the boundary and forces re-validation everywhere.
- The same conceptual payloads are being normalized repeatedly instead of being promoted into named domain types.

Where it is justified:

- Raw SQL rows in [app/actions/admin.ts](/C:/Users/pc/convy/app/actions/admin.ts:1)
- External request payload boundaries
- Generic infra wrappers

Where it looks under-modeled:

- persistent learning metadata
- message part payloads
- survey/tutoring runtime message structures

### 5. Redundant Nested Literal Locking In Config

Primary hotspot:

- [shared/config/app-config.ts](/C:/Users/pc/convy/shared/config/app-config.ts:1)

Examples:

- `window: "1 m" as const`
- `DEFAULT_MODEL: "gemini-3.1-flash-lite" as const`
- large objects already ending with `as const`

Why this is a smell:

- Some of the inner `as const` usages are redundant because the enclosing object is already frozen with `as const`.
- The file mixes genuinely useful literal preservation with unnecessary per-property assertions.
- This makes it harder to tell which literal constraints matter.

Secondary smell in the same file:

- `return envValue as T;` inside `getConfig(...)`

This is a smaller issue, but it still shows the function signature and implementation are not aligned cleanly enough for TypeScript to express the behavior without a cast.

### 6. Type-System Backpressure In Message Parsing UI

Primary hotspot:

- [app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx](/C:/Users/pc/convy/app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx:1)

Symptoms:

- `const messageRecord = message as unknown as Record<string, unknown>;`
- the component reconstructs text/parts/metadata from broad message objects

Why this is a smell:

- The UI is compensating for weak upstream message typing.
- It likely wants a better normalized `LiveMessage` boundary before rendering.

## Smells That Look Worse In Raw Counts Than They Really Are

These showed up strongly in pattern metrics but are not automatically bad.

### `as const` On Query Keys

- Good usage in [shared/http/query-keys.ts](/C:/Users/pc/convy/shared/http/query-keys.ts:1)

### `Record<string, unknown>` In Raw SQL Or Unknown External Payloads

- Good usage in [app/actions/admin.ts](/C:/Users/pc/convy/app/actions/admin.ts:1)
- Good usage in parser-style helpers such as [features/tutoring/ui/student-profile-page.tsx](/C:/Users/pc/convy/features/tutoring/ui/student-profile-page.tsx:1)

### Type Predicates

- The repo has many `value is ...` predicates.
- This is generally a positive sign, not a smell.

## Priority Hotspots

If this repo is going to get a type cleanup pass, these are the best starting points.

1. [features/surveys/server/respondent-runtime-service.ts](/C:/Users/pc/convy/features/surveys/server/respondent-runtime-service.ts:1)
2. [features/surveys/realtime/survey-response-voice.ts](/C:/Users/pc/convy/features/surveys/realtime/survey-response-voice.ts:1)
3. [app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx](/C:/Users/pc/convy/app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx:1)
4. [shared/http/page-data/workspace-shell-page-data.ts](/C:/Users/pc/convy/shared/http/page-data/workspace-shell-page-data.ts:1)
5. [shared/db/schema/learning.ts](/C:/Users/pc/convy/shared/db/schema/learning.ts:1)
6. [shared/config/app-config.ts](/C:/Users/pc/convy/shared/config/app-config.ts:1)

## Recommended Direction

### Phase 1

- Remove cargo-cult `true as const` / `false as const` where no discriminated union is being modeled.
- Keep result-tag literals that genuinely define unions.

### Phase 2

- Replace `unknown` + `as Parameters<typeof ...>` chains with named validated input types in survey runtime orchestration.

### Phase 3

- Introduce domain types for persistent JSON payloads that are currently just `Record<string, unknown>`.
- Normalize once at the boundary, not repeatedly in UI and server flows.

### Phase 4

- Refactor nullable runtime state objects into discriminated state unions to remove non-null assertions.

## Bottom Line

The repo is not suffering from `any`.

The dominant type problems are:

- assertion-heavy orchestration
- weak modeling of JSON-shaped domain data
- nullable state that should be phase-typed
- unnecessary literal assertions in a subset of files

That means the cleanup strategy should focus on modeling and flow typing, not on hunting `any`.
