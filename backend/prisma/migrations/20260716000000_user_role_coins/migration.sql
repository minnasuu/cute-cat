-- 用户分级 + 喵币计费
--   1. User 加角色/喵币/邀请字段
--   2. 新 CoinTransaction 流水表
--   3. 存量用户补 role、coins=100(若为 0)、生成 inviteCode

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coins" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invitedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 邀请码唯一约束(允许多 NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "User_inviteCode_key" ON "User"("inviteCode");

CREATE INDEX IF NOT EXISTS "User_invitedById_idx" ON "User"("invitedById");

CREATE TABLE IF NOT EXISTS "CoinTransaction" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "amount"        INTEGER NOT NULL,
    "balanceAfter"  INTEGER NOT NULL,
    "type"          TEXT NOT NULL,
    "refId"         TEXT,
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CoinTransaction_userId_type_idx" ON "CoinTransaction"("userId", "type");
