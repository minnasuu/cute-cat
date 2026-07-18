-- 内测码表(BetaCode)
-- 一次性准入码,每个码只能用于一个用户注册;管理员批量生成,注册时原子消费

CREATE TABLE IF NOT EXISTS "BetaCode" (
    "id"        TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "used"      BOOLEAN NOT NULL DEFAULT false,
    "usedById"  TEXT,
    "usedAt"    TIMESTAMP(3),
    "note"      TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BetaCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BetaCode_code_key" ON "BetaCode"("code");
CREATE INDEX IF NOT EXISTS "BetaCode_code_idx" ON "BetaCode"("code");
CREATE INDEX IF NOT EXISTS "BetaCode_used_idx" ON "BetaCode"("used");
CREATE INDEX IF NOT EXISTS "BetaCode_usedById_idx" ON "BetaCode"("usedById");
