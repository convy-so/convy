-- Add locale-aware features for survey system
-- Migration: 0006_add_locale_tracking

-- Step 1: Add preferred language to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en';

-- Step 2: Add language tracking to survey conversations
ALTER TABLE survey_conversations
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(5) DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS translated_conversation JSONB;

-- Step 3: Add language to analytics for tracking generation language
ALTER TABLE survey_analytics
  ADD COLUMN IF NOT EXISTS generated_language VARCHAR(5) DEFAULT 'en';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS users_preferred_language_idx ON users(preferred_language);
CREATE INDEX IF NOT EXISTS survey_conversations_original_language_idx ON survey_conversations(original_language);
