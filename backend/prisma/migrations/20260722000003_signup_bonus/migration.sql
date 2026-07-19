-- 注册奖励领取记录(SignupBonus)
-- 独立于 User 表(不建外键),用户注销后仍保留,防止同一邮箱重复领取注册奖励

CREATE TABLE IF NOT EXISTS "SignupBonus" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "userId"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupBonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SignupBonus_email_key" ON "SignupBonus"("email");

-- 回填:为修复前已领取过注册奖励的邮箱预建记录(基于 signup_bonus 流水),
-- 避免老用户注销后被当作新用户再次发放
INSERT INTO "SignupBonus" ("id", "email", "userId", "createdAt")
SELECT gen_random_uuid(), u."email", t."userId", t."createdAt"
FROM "CoinTransaction" t
JOIN "User" u ON u."id" = t."userId"
WHERE t."type" = 'signup_bonus'
ON CONFLICT ("email") DO NOTHING;
