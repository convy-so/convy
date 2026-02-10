-- Add Spanish (es) and Italian (it) to the language enum
-- This allows surveys to be created in 5 languages: en, fr, de, es, it

ALTER TYPE "language" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "language" ADD VALUE IF NOT EXISTS 'it';
