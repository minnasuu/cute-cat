-- 充值兑换码
-- 用途: 用户在个人中心输入兑换码充值喵币,替代模拟支付兜底方案
-- 三种档位: basic(1000 喵币) / plus(3000) / pro(8000)
-- 兑换码一次有效,使用后记录 usedById/usedAt

CREATE TABLE "RedemptionCode" (
    "id"       TEXT      NOT NULL,
    "code"     TEXT      NOT NULL,
    "tier"     TEXT      NOT NULL,
    "coins"    INTEGER   NOT NULL,
    "used"     BOOLEAN   NOT NULL DEFAULT false,
    "usedById" TEXT,
    "usedAt"   TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RedemptionCode_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RedemptionCode_code_key" ON "RedemptionCode"("code");
CREATE INDEX "RedemptionCode_code_idx" ON "RedemptionCode"("code");
CREATE INDEX "RedemptionCode_usedById_idx" ON "RedemptionCode"("usedById");
