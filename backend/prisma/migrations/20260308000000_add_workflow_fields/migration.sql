-- Add missing columns to Workflow table
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "endTime" TEXT;
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "persistent" BOOLEAN NOT NULL DEFAULT false;
