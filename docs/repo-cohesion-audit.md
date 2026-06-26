# Repo Cohesion Audit

Generated: 2026-06-26T12:24:16.985Z

This matrix is the lightweight artifact for the cohesion refactor program. Every audited code-bearing file has a disposition, a batch assignment, a role, a boundary classification, import metadata, and a one-sentence purpose statement in `repo-cohesion-audit.json`.

## Coverage
- Audited files: 751
- Mutation scope covered: `app`, `features`, `shared`
- Tail-end review scope classified in Batch F: `i18n`, `scripts`, `docker`, root config files, tests, workers, schemas, migrations

## Actions
| Action | Count |
| --- | ---: |
| keep | 725 |
| merge | 9 |
| rename | 1 |
| split | 16 |

## Batch Allocation
| Batch | Count |
| --- | ---: |
| Batch A | 104 |
| Batch B | 187 |
| Batch C | 115 |
| Batch D | 199 |
| Batch E | 67 |
| Batch F | 79 |

## Primary Hotspots
- `shared/db/schema/tutoring.ts` - 1421 lines - keep - Batch F - dense dependency hub, oversized but cohesive
- `shared/db/schema/surveys.ts` - 969 lines - keep - Batch F - dense dependency hub, oversized but cohesive
- `features/surveys/ui/analytics/narrative-report.tsx` - 790 lines - split - Batch C - oversized and mixed-concern
- `shared/realtime/server.ts` - 752 lines - split - Batch A - dense dependency hub, oversized and mixed-concern
- `app/[locale]/s/[shareableLink]/respond/survey-respond-page-content.tsx` - 733 lines - split - Batch D - dense dependency hub, oversized and mixed-concern
- `features/surveys/ui/sample-review-page-client/index.tsx` - 728 lines - split - Batch C - dense dependency hub, generic naming, oversized and mixed-concern
- `features/surveys/ui/survey-detail-page-client/index.tsx` - 705 lines - split - Batch C - dense dependency hub, generic naming, oversized and mixed-concern
- `features/surveys/ui/create-survey-page-client/index.tsx` - 639 lines - keep - Batch C - dense dependency hub, generic naming
- `app/[locale]/student/classes/[classroomId]/lessons/live-session-client.tsx` - 638 lines - keep - Batch D - dense dependency hub
- `features/surveys/realtime/survey-response-voice.ts` - 625 lines - keep - Batch C - dense dependency hub
- `features/surveys/realtime/sample-survey-voice.ts` - 604 lines - keep - Batch C - dense dependency hub
- `app/actions/survey/survey-lifecycle-actions.ts` - 592 lines - keep - Batch D - dense dependency hub
- `shared/tutoring/constants.ts` - 575 lines - keep - Batch A - dense dependency hub
- `features/tutoring/ui/lesson-setup-page/index.tsx` - 451 lines - keep - Batch B - dense dependency hub, generic naming
- `features/tutoring/server/actions/tutoring-actions.ts` - 419 lines - keep - Batch B - dense dependency hub
- `features/tutoring/server/prompt-serializers.ts` - 400 lines - split - Batch B - dense dependency hub, oversized and mixed-concern
- `features/auth/server/server-auth.ts` - 396 lines - keep - Batch E - dense dependency hub
- `features/surveys/server/use-cases/submit-sample-turn-helpers.ts` - 389 lines - keep - Batch C - dense dependency hub
- `features/tutoring/server/actions/lesson-actions.ts` - 388 lines - keep - Batch B - dense dependency hub
- `features/tutoring/server/materials-route-service/material-upload-attempt-processor.ts` - 376 lines - keep - Batch B - dense dependency hub
