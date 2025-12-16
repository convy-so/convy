-- Add personalInfo field to surveys table
-- This field stores an array of personal information types to collect (e.g., email, name, phone number)

ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "personal_info" TEXT[] DEFAULT '{}';

