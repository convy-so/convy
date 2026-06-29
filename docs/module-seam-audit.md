# Module and Seam Audit

## Scope
- Applied to all code files under `app/`, `features/`, `shared/`, and `i18n/`.
- Excluded by request: root config files, root operational files, assets, locale JSON content, generated output, and infrastructure files outside the runtime code review surface.
- Coverage: `702` code files mapped to `38` modules. Full ledger: [`docs/module-seam-audit.coverage.csv`](/C:/Users/pc/convy/docs/module-seam-audit.coverage.csv).

## Reading Order
1. `M01-M10` to understand app composition, auth, privacy, and public surface area.
2. `M11-M18` for the full surveys stack from draft creation through analytics and voice runtime.
3. `M19-M27` for the tutoring stack from classroom setup through live tutoring, reporting, and expert governance.
4. `M28-M38` for shared platform seams used by both feature systems.

## Module Catalog
| ID | Module | Owns | Covered Paths | Main Seams | Files |
| --- | --- | --- | --- | --- | ---: |
| M01 | App Shell and Locale Routing | Owns the locale-aware root layout, metadata, providers, and fallback routing surface for the Next.js app. | `app/[locale]/layout.tsx; app/providers.tsx; i18n/*` | S01, S02 | 11 |
| M02 | App Auth/Admin/Workspace Composition | Owns auth, admin, privacy, and workspace composition at the route/page/action layer without owning the underlying business rules. | `app/actions/{admin,expert-knowledge,folder,notifications,translate}.ts; app/api/{auth,expert,privacy,...}; app/[locale]/(auth/dashboard misc/admin)/*` | S01, S02, S03 | 65 |
| M03 | App Survey Composition | Owns the survey-facing HTTP pages, route handlers, and public response surfaces that compose survey modules into web endpoints. | `app/actions/survey*; app/api/surveys/**/*; app/[locale]/(dashboard)/dashboard/{analytics,create,surveys}/*; app/[locale]/s/*` | S01, S02, S03, S08, S12 | 51 |
| M04 | App Tutoring Composition | Owns the tutoring-facing HTTP pages, route handlers, and student/expert workspace surfaces that compose tutoring modules into web endpoints. | `app/actions/classroom*; app/api/{classrooms,lessons,students,tutoring}/*; app/[locale]/{student,expert,dashboard/teaching}/*` | S01, S02, S03, S07, S08 | 70 |
| M05 | Auth Runtime and Provisioning | Owns session verification, role policy, signup intent enforcement, invitation state, and privileged account provisioning. | `features/auth/server/*; features/auth/public-server.ts` | S04, S05, S06, S11 | 17 |
| M06 | Auth Client UI and Emails | Owns auth client wiring, auth form components, and auth-specific outbound email templates. | `features/auth/{client,ui,email}/*; public-client.ts; public-ui.ts` | S04, S11 | 21 |
| M07 | Privacy and Compliance | Owns consent state, privacy request handling, respondent/user deletion-export flows, and privacy scrubbing hooks. | `features/privacy/**/*` | S05, S10 | 8 |
| M08 | Marketing Presentation | Owns the public marketing and legal presentation surface for the product website. | `features/marketing/ui/*; app/[locale]/page.tsx; app/[locale]/(legal)/*` | S01 | 18 |
| M09 | Admin Presentation | Owns reusable admin-facing dashboard widgets and navigation presentation. | `features/admin/ui/*` | S01 | 5 |
| M10 | Feedback and Settings | Owns feedback submission behavior and settings-page presentation for authenticated users. | `features/{feedback,settings}/**/*` | S01, S05 | 3 |
| M11 | Survey Catalog and Access | Owns survey permissions, survey listing/detail contracts, and survey-level access checks. | `features/surveys/server/{survey-access,public-survey-access,surveys-route-service,translation-service}; validation/*; use-cases/get-survey-{details,response-detail}.ts` | S04, S05, S12 | 8 |
| M12 | Survey Research Model and Storage | Owns the canonical research brief, coverage-plan, session, analytics schemas, and their persistence helpers for the survey domain. | `features/surveys/server/education/{types,storage}/*; {catalog,brief-media,runtime-context}.ts` | S05, S06, S09, S12, S13 | 10 |
| M13 | Survey Creation Workflow | Owns draft-brief extraction, creation conversation state, and the orchestration that takes a survey from blank draft to sample-ready. | `features/surveys/server/education/creation*; survey-create-orchestrator.ts; use-cases/get-survey-creation-state.ts` | S01, S03, S05, S06, S09 | 9 |
| M14 | Survey Sample and Refinement Workflow | Owns sample-conversation review, sample feedback, and refinement proposal lifecycle for survey iteration. | `features/surveys/server/education/{refinement*,sample-feedback*}; use-cases/{get-sample-conversation-state,sample-finish-tool,submit-sample-turn}.ts` | S01, S03, S05, S06 | 8 |
| M15 | Survey Respondent Runtime | Owns the text interview runtime for respondents, including conducting-turn planning, normalization, and session progression. | `features/surveys/server/respondent*; message-normalizer.ts; education/conducting-runtime*; education/agent-tools.ts` | S01, S05, S06, S08, S09, S13 | 16 |
| M16 | Survey Analytics Pipeline | Owns analytics scheduling, snapshot generation, comparison, translation, and analytics view-model assembly. | `features/surveys/server/analytics/*; education/analytics*; use-cases/get-survey-analytics.ts; workers/survey-analytics.worker.ts` | S01, S05, S06, S07, S12, S13 | 12 |
| M17 | Survey Voice Runtime | Owns realtime voice interview handling, sample voice sessions, and provider-specific voice-agent integration for surveys. | `features/surveys/{realtime,voice}/*` | S08, S10, S12, S13 | 12 |
| M18 | Survey UI Clients | Owns survey-side client fetchers, creator/detail/analytics UI state, and survey workspace presentation decisions. | `features/surveys/{client,creator,ui,email}/*` | S01, S03, S12 | 41 |
| M19 | Classroom and Roster Management | Owns classroom access, roster state, invitations, course lookup, and intervention roster management for tutoring. | `features/tutoring/server/{access,classroom*,course-service,teacher-route-access,intervention-service}; student-service/*` | S01, S04, S05, S07, S11 | 16 |
| M20 | Lesson Authoring and Readiness | Owns lesson records, learning outcomes, source boundaries, and lesson-readiness evaluation. | `features/tutoring/server/{lesson-service,lesson-foundation-schemas,grade-band-normalization,readiness}; lesson actions/routes` | S01, S04, S05, S06, S09 | 7 |
| M21 | Lesson Material Ingestion and Grounding | Owns material upload attempts, extraction, analysis, indexing, grounding-pack rebuilds, and lesson-material workers. | `features/tutoring/server/{materials*,materials-route-service/*,lesson-grounding-pack-service/*,grounding-units,lesson-grounding-pack-render}; lesson-material workers/scripts/routes` | S05, S06, S07, S09, S11 | 33 |
| M22 | Expert Framework Governance | Owns expert frameworks, crystallizations, conflict handling, and the validated runtime snapshots that tutoring consumes. | `features/tutoring/server/{expert*,framework*}; expert ui; expert framework scripts/tests` | S01, S05, S06, S13 | 25 |
| M23 | Tutoring Session Runtime | Owns tutoring-session access, session state, turn preparation/finalization, prompt assembly, and live tutoring orchestration. | `features/tutoring/server/{student-session*,tutoring*,tutor*,session-engine,context-engineering,out-of-session,prompt-serializers,route-errors,subject-packages}; tutoring route/action` | S01, S04, S05, S06, S08, S13 | 29 |
| M24 | Tutoring Reporting and Evidence | Owns evidence indexing/hydration, teacher evidence answers, and progress-report generation for tutoring outcomes. | `features/tutoring/server/evidence/*; reporting.ts; prompts/{evidence,reporting}; lesson report/question routes; tutoring report worker` | S01, S05, S06, S07, S09 | 12 |
| M25 | Student Onboarding and Pattern Memory | Owns onboarding interviews, interest profiles, pattern analysis, and the long-horizon memory/playbook layer for students. | `features/tutoring/server/{onboarding,onboarding-route-service,mem0,student-profile-storage,pattern-types}; patterns/*` | S01, S05, S06, S13 | 15 |
| M26 | Tutoring Media Retrieval and Generative Cards | Owns external media lookup, tutor media recommendation, tool contracts, and quiz/grade card rendering contracts. | `features/tutoring/server/{media,media-retrieval/*,agent-tools,quiz-image-guidance}; ui/generative/*` | S05, S06, S09, S13 | 14 |
| M27 | Tutoring UI Clients | Owns teacher/student tutoring workspace client state and tutoring-specific frontend presentation. | `features/tutoring/{client,ui,email}/*` | S01, S03, S12 | 41 |
| M28 | Shared AI Runtime | Owns model selection, prompt execution, caching, sanitization, and shared structured/streamed AI generation helpers. | `shared/ai/*` | S06, S13 | 23 |
| M29 | Shared Retrieval Engine | Owns generic embedding, indexing, search, reranking, and retrieval SQL helpers. | `shared/retrieval/*` | S05, S09 | 8 |
| M30 | Shared DB Schema and Connection | Owns database connection policy, schema definitions, migrations, and transient database error handling. | `shared/db/*` | S05 | 20 |
| M31 | Shared Infra Queues Storage and Workers | Owns Redis/queue bootstrap, storage adapters, logging, cache, and background worker runtime glue. | `shared/infra/*` | S07, S10, S11, S12 | 12 |
| M32 | Shared Realtime Transport | Owns authenticated websocket subscription runtime and reusable realtime client hooks. | `shared/realtime/*` | S08, S10 | 6 |
| M33 | Shared I18n and Translation | Owns locale resolution, translation caching, dynamic translation, and translation-queue orchestration. | `shared/i18n/*` | S12 | 7 |
| M34 | Shared HTTP Contracts and Page Data | Owns API/action error envelopes, page-data loaders, auth-query context, and query-key contracts. | `shared/http/*` | S01, S02, S03 | 17 |
| M35 | Shared Email Dispatch | Owns high-level email dispatch contracts and shared email layout primitives. | `shared/email/*` | S11 | 2 |
| M36 | Shared Chat Contracts | Owns chat message normalization, chat UI signal tags, and chat-type contracts shared across AI flows. | `shared/chat/*` | S06, S08 | 4 |
| M37 | Shared UI Kit | Owns reusable UI primitives, markdown/chat rendering helpers, and dashboard shell components. | `shared/ui/*` | S01, S03 | 13 |
| M38 | Shared Config Security and Constants | Owns environment/config loading, low-level security utilities, small constant packages, and generic helpers. | `shared/{config,security,auth,billing,feedback,privacy,surveys,tutoring,utils}/*` | S05, S10, S12 | 13 |

## Seam Catalog
| Seam | Contract | Description |
| --- | --- | --- |
| S01 | Request/response DTO seams | App pages, routes, and server actions talk to owner modules through HTTP or action payloads plus shared error/result envelopes. |
| S02 | Page-data view model seams | Pages consume serialized view models from shared page-data loaders instead of reconstructing domain state inline. |
| S03 | Client fetch and query seams | Client hooks and page clients depend on app APIs through fetch contracts, zod schemas, and query keys. |
| S04 | Public feature export seams | public-server, public-client, and public-ui barrels expose stable feature shapes while hiding internal file topology. |
| S05 | Database row-shape seams | Domain modules depend on shared Drizzle schema types and query helpers rather than each other's persistence details. |
| S06 | AI prompt/runtime seams | Feature modules call shared AI generation, prompt-spec, tool, and structured-output contracts without owning model plumbing. |
| S07 | Queue job payload seams | Background work crosses process boundaries through shared queue names and typed job-data payloads. |
| S08 | Realtime and voice message seams | Realtime subscriptions and voice handlers communicate through websocket channel names and event envelopes. |
| S09 | Retrieval and evidence seams | Retrieval-backed modules depend on shared embedding/search contracts plus feature-specific evidence payload shapes. |
| S10 | Privacy scrubbing seams | Sentry, websocket, and worker runtimes hand events to privacy scrubbing code through explicit sanitized-event hooks. |
| S11 | Email and storage seams | Features hand email jobs and storage operations to shared dispatch/storage services through typed payloads and paths. |
| S12 | Localization seams | Features rely on shared locale resolution and translation queue contracts using locale/resource/text identifiers. |
| S13 | Pedagogy snapshot seams | Survey and tutoring runtimes exchange validated brief, coverage-plan, expert-framework, and student-session schemas as authoritative shapes. |

## Coupling Hot Spots
- `app/*` is not a pure adapter layer yet: multiple survey and tutoring routes/pages import `shared/db` directly, so some web surfaces bypass feature-owner services and reach into persistence.
- `shared/ai/index.ts` imports tutoring diagnostics from `features/tutoring/public-server`, which means the supposed shared AI runtime is coupled to one feature implementation.
- `shared/http/page-data/*` is a composition seam, not a neutral shared domain module, because it imports feature services from tutoring, auth, and surveys to build page-specific view models.
- Survey and tutoring each keep owner logic and UI clients in the same feature root, so the seam exists by convention and import discipline rather than by package isolation.

## Coverage Summary
- `adapter/composition`: `197` files
- `deferred-tests-scripts`: `13` files
- `owner-module`: `367` files
- `shared-contract`: `125` files
- Tests and maintenance scripts are included in the CSV ledger and mapped back to their owning runtime modules.
- If you want to review module-by-module next, use the module IDs in this order: `M05`, `M11`, `M15`, `M16`, `M19`, `M21`, `M22`, `M23`, `M24`, then the shared modules they depend on.
