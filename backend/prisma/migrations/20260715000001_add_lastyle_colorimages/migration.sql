-- Add LAStyle table (款式资源) + LAMaterial.colorImages (面料色卡)

CREATE TABLE IF NOT EXISTS "LAStyle" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "category"  TEXT NOT NULL,
    "tags"      JSONB NOT NULL DEFAULT '[]'::jsonb,
    "image"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LAStyle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LAStyle_teamId_idx" ON "LAStyle"("teamId");

CREATE INDEX IF NOT EXISTS "LAStyle_category_idx" ON "LAStyle"("category");

ALTER TABLE "LAMaterial" ADD COLUMN IF NOT EXISTS "colorImages" JSONB NOT NULL DEFAULT '[]'::jsonb;
