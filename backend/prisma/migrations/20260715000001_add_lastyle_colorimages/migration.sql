-- Add LAStyle table (款式资源) + LAMaterial.colorImages (面料色卡)

CREATE TABLE "LAStyle" (
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

CREATE INDEX "LAStyle_teamId_idx" ON "LAStyle"("teamId");

CREATE INDEX "LAStyle_category_idx" ON "LAStyle"("category");

ALTER TABLE "LAMaterial" ADD COLUMN "colorImages" JSONB NOT NULL DEFAULT '[]'::jsonb;
