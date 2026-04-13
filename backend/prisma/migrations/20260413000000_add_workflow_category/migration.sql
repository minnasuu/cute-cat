-- Add category column for workflow classification
ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'ecommerce';

-- Backfill official seeds by name
UPDATE "Workflow" SET "category" = 'internet' WHERE "name" = '落地页';
UPDATE "Workflow" SET "category" = 'ecommerce' WHERE "name" IN ('海报制作', '品牌气质卡');

