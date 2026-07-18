-- 系统配置表(SystemConfig)
-- 用于存放可用喵币、定价规则等管理员可调整的运行时配置(key-value,值为 JSON 字符串)

CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "id"        TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "note"      TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemConfig_key_key" ON "SystemConfig"("key");
CREATE INDEX IF NOT EXISTS "SystemConfig_key_idx" ON "SystemConfig"("key");
