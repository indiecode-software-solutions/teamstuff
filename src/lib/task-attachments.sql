-- Migration to add attachments support to tasks table
-- Idempotent script: safe to execute multiple times.

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add index for JSON operations if necessary
CREATE INDEX IF NOT EXISTS idx_tasks_attachments ON tasks USING gin (attachments);
