-- Add missing placeholder column to Workflow table (used by workbench + UI).
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "placeholder" TEXT;

