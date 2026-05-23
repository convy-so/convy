# Foreign key delete behavior (schema reference)

This documents intentional `onDelete` choices in `db/schema`. After editing, generate and apply migrations yourself.

## Course catalog (`courses`)

| Child table | Column | onDelete | Rationale |
|-------------|--------|----------|-----------|
| `expert_frameworks` | `course_id` | **cascade** | Framework artifacts belong to the course row; removing a catalog course removes its expert framework tree. |
| `expert_runtime_models` | `course_id` | **cascade** | Published runtime snapshots are derived from that course’s framework. |
| `learning_topics` | `course_id` | **restrict** | Classroom topics must be removed or reassigned before deleting a course used in live teaching. |
| `expert_review_cases` | `course_id` | set null | Keep audit history if course row is removed elsewhere. |
| `expert_crystallizations` | `course_id` | set null | Same. |
| `expert_conflicts` | `course_id` | set null | Same. |

**Deleting a course in Supabase/UI:** succeeds when no `learning_topics` rows reference it. Auto-seeded expert-only courses (framework only, no topics) delete cleanly once migrations apply cascade on `expert_frameworks` / `expert_runtime_models`.

## Expert framework graph

```
courses
  └─ cascade → expert_frameworks
                  ├─ set null ← topic_id, classroom_id (optional anchors only)
                  ├─ set null ← active_version_id → expert_framework_versions
                  └─ cascade → expert_framework_versions
                                  └─ cascade → expert_runtime_models (via framework_id)
```

**Previous bug:** `expert_frameworks.course_id` used `restrict`, so deleting a course failed even when only expert metadata existed.

**Previous bug:** `expert_frameworks.topic_id` and `classroom_id` used `cascade`, so deleting a classroom or topic could delete the whole course framework.

## Surveys / auth / folders

Survey subgraph uses **cascade** from `surveys` and `users` consistently. See `surveys.ts` for the full tree.

## Soft pointers (no FK in DB)

- `student_models.latest_snapshot_id` — application-managed
- Some JSON `runtimeModelId` fields in session state — not enforced at DB level
