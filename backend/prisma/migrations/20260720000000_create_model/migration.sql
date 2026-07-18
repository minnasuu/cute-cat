-- 创建 LAModel 表(服装模特:用户上传自己品牌的模特,管理员可共享进系统模特库)

CREATE TABLE IF NOT EXISTS "LAModel" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "height"    DOUBLE PRECISION,
    "weight"    DOUBLE PRECISION,
    "bust"      DOUBLE PRECISION,
    "waist"     DOUBLE PRECISION,
    "hip"       DOUBLE PRECISION,
    "shoes"     DOUBLE PRECISION,
    "images"    JSONB NOT NULL DEFAULT '[]',
    "tags"      JSONB NOT NULL DEFAULT '[]',
    "shared"    BOOLEAN NOT NULL DEFAULT false,
    "sharedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LAModel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LAModel_teamId_idx" ON "LAModel"("teamId");
CREATE INDEX IF NOT EXISTS "LAModel_shared_idx" ON "LAModel"("shared");
