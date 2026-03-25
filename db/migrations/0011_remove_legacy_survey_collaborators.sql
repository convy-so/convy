INSERT INTO survey_editors (survey_id, user_id, granted_by, granted_at)
SELECT
  surveys.id,
  editor_ids.user_id,
  surveys.user_id,
  COALESCE(surveys.updated_at, surveys.created_at, NOW())
FROM surveys
CROSS JOIN LATERAL unnest(COALESCE(surveys.collaborators, ARRAY[]::text[])) AS editor_ids(user_id)
WHERE editor_ids.user_id IS NOT NULL
  AND editor_ids.user_id <> ''
  AND editor_ids.user_id <> surveys.user_id
ON CONFLICT (survey_id, user_id) DO NOTHING;

ALTER TABLE surveys DROP COLUMN IF EXISTS collaborators;
