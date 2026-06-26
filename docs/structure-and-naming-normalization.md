# Structure And Naming Normalization

## Structure rules
- `app/` is the Next.js routing shell only.
- Route-local private app files may sit beside a framework route file or a deliberately allowlisted app shell file when their filenames are explicit and local to that route.
- Business ownership lives under `features/`.
- Shared technical foundations live under `shared/`.
- Current top-level feature roots:
  - `features/admin`
  - `features/auth`
  - `features/feedback`
  - `features/marketing`
  - `features/privacy`
  - `features/settings`
  - `features/surveys`
  - `features/tutoring`
- Current top-level shared roots:
  - `shared/ai`
  - `shared/auth`
  - `shared/billing`
  - `shared/chat`
  - `shared/config`
  - `shared/db`
  - `shared/email`
  - `shared/feedback`
  - `shared/http`
  - `shared/i18n`
  - `shared/infra`
  - `shared/privacy`
  - `shared/realtime`
  - `shared/retrieval`
  - `shared/security`
  - `shared/surveys`
  - `shared/tutoring`
  - `shared/ui`
  - `shared/utils`

## Naming rules
- Use lowercase kebab-case for ordinary filenames.
- Keep framework filenames only where the framework requires them:
  - `page.tsx`
  - `layout.tsx`
  - `route.ts`
  - `loading.tsx`
  - `error.tsx`
  - `not-found.tsx`
- Prefer `domain-concept + responsibility` names.
- Prefer business terms before technical terms.
- Use singular domain nouns unless the file is truly collection-oriented.
- Do not rely on `_components` or `_lib` as naming substitutes for explicit filenames.

## Banned low-signal filenames
- `utils`
- `helpers`
- `service`
- `shared`
- `runtime`
- `storage`
- `manager`
- `handler`
- `queries`
- `types`
- `index`

## Temporary allowlist
- The first delivery is still carrying a small set of legacy modules that need later decomposition or public API cleanup.
- The current allowlist lives in [structure-audit-allowlist.json](/C:/Users/pc/convy/docs/structure-audit-allowlist.json).
- Every new exception must be added there deliberately; the audits are otherwise fail-closed.

## Audit commands
- `pnpm audit:structure`
- `pnpm audit:imports`
- `pnpm audit:repo`
- `pnpm audit:cohesion`
