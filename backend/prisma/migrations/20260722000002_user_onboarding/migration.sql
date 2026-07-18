-- User 表补充 onboardingDone 字段(新手引导完成标记)
-- schema 中已定义 Boolean @default(false),但此前缺少 migration,导致 prisma.user.create 报 P2022

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingDone" BOOLEAN NOT NULL DEFAULT false;
