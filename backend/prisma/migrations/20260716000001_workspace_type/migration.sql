-- 工作台概念:Team 加 workspaceType / isOfficial
--   额度(喵币)按用户计,跨工作台天然通用;这里只补工作台元数据。

ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "workspaceType" TEXT NOT NULL DEFAULT 'clothing';
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Team_ownerId_workspaceType_idx" ON "Team"("ownerId", "workspaceType");
