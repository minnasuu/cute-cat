-- 补齐 LAMaterial / LAStyle 的共享字段(shared / sharedById / 索引)
-- schema.prisma 已声明,但此前缺少 migration(开发环境由 db push 直接同步,生产环境 migrate deploy 无此列导致 P2022)

ALTER TABLE "LAMaterial" ADD COLUMN IF NOT EXISTS "shared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LAMaterial" ADD COLUMN IF NOT EXISTS "sharedById" TEXT;
CREATE INDEX IF NOT EXISTS "LAMaterial_shared_idx" ON "LAMaterial"("shared");

ALTER TABLE "LAStyle" ADD COLUMN IF NOT EXISTS "shared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LAStyle" ADD COLUMN IF NOT EXISTS "sharedById" TEXT;
CREATE INDEX IF NOT EXISTS "LAStyle_shared_idx" ON "LAStyle"("shared");
