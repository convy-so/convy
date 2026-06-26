# Repo Cohesion Audit

Generated: 2026-06-23T18:04:43.217Z

This matrix is the lightweight artifact for the cohesion refactor program. Every audited code-bearing file has a disposition, a batch assignment, a role, a boundary classification, import metadata, and a one-sentence purpose statement in `repo-cohesion-audit.json`.

## Coverage
- Audited files: 759
- Mutation scope covered: `app`, `features`, `shared`
- Tail-end review scope classified in Batch F: `i18n`, `scripts`, `docker`, root config files, tests, workers, schemas, migrations

## Actions
| Action | Count |
| --- | ---: |
| keep | 740 |
| merge | 6 |
| rename | 1 |
| split | 12 |

## Batch Allocation
| Batch | Count |
| --- | ---: |
| Batch A | 94 |
| Batch B | 187 |
| Batch C | 112 |
| Batch D | 224 |
| Batch E | 67 |
| Batch F | 75 |

## Primary Hotspots
- `shared/db/schema/learning.ts` - 1365 lines - keep - Batch F - dense dependency hub, oversized but cohesive
- `shared/db/schema/surveys.ts` - 945 lines - keep - Batch F - dense dependency hub, oversized but cohesive
- `app/[locale]/s/[shareableLink]/respond/survey-respond-page-content.tsx` - 699 lines - keep - Batch D - dense dependency hub
- `features/surveys/ui/sample-review-page-client/index.tsx` - 685 lines - keep - Batch C - dense dependency hub, generic naming
- `features/surveys/ui/survey-detail-page-client/index.tsx` - 683 lines - keep - Batch C - dense dependency hub, generic naming
- `app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx` - 671 lines - keep - Batch D - dense dependency hub
- `features/surveys/ui/create-survey-page-client/index.tsx` - 608 lines - keep - Batch C - dense dependency hub, generic naming
- `features/surveys/realtime/survey-response-voice.ts` - 603 lines - keep - Batch C - dense dependency hub
- `features/surveys/realtime/sample-survey-voice.ts` - 578 lines - keep - Batch C - dense dependency hub
- `features/tutoring/ui/lesson-setup-page/index.tsx` - 441 lines - keep - Batch B - dense dependency hub, generic naming
- `features/tutoring/server/actions/tutoring-actions.ts` - 398 lines - keep - Batch B - dense dependency hub
- `features/tutoring/server/prompt-serializers.ts` - 380 lines - keep - Batch B - dense dependency hub
- `features/auth/server/server-auth.ts` - 369 lines - keep - Batch E - dense dependency hub
- `features/tutoring/server/actions/lesson-actions.ts` - 369 lines - keep - Batch B - dense dependency hub
- `features/surveys/server/use-cases/submit-sample-turn.ts` - 359 lines - keep - Batch C - dense dependency hub
- `features/tutoring/server/api/lesson-tutoring-session-route.ts` - 355 lines - keep - Batch B - dense dependency hub
- `shared/ai/index.ts` - 351 lines - keep - Batch A - dense dependency hub, generic naming
- `features/tutoring/server/api/lesson-materials-route.ts` - 347 lines - keep - Batch B - dense dependency hub
- `shared/http/page-data/student-workspace-page-data.ts` - 333 lines - keep - Batch A - dense dependency hub
- `features/surveys/server/analytics/dashboard-analytics.ts` - 329 lines - keep - Batch C - dense dependency hub
