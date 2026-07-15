-- 创建 LAIllustrationAsset 表(插画资源,schema.prisma 已声明但此前缺少 migration)

CREATE TABLE IF NOT EXISTS "LAIIllustrationAsset" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "tags"      JSONB NOT NULL DEFAULT '[]',
    "image"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LAIIllustrationAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LAIIllustrationAsset_teamId_idx" ON "LAIIllustrationAsset"("teamId");
