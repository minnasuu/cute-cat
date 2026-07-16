-- Add structured design proposal sections to LAProduct
ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "sections" JSONB;
