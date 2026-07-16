-- 修正 LAIllustrationAsset 表名拼写错误
-- 原 migration 20260717000002 误将表名建为 "LAIIllustrationAsset"(LAII,多一个 I),
-- 与 schema 模型名 LAIllustrationAsset 不一致 → Prisma 按模型名查表报 P2021 表不存在。
-- 本迁移将错表 RENAME 为正确名;若正确表已存在(db push 等已建)则跳过并清理残留错表。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LAIllustrationAsset') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LAIIllustrationAsset') THEN
      ALTER TABLE "LAIIllustrationAsset" RENAME TO "LAIllustrationAsset";
    END IF;
  END IF;
END $$;
ALTER INDEX IF EXISTS "LAIIllustrationAsset_teamId_idx" RENAME TO "LAIllustrationAsset_teamId_idx";
-- 清理残留的错名表(若正确表已存在,错表无数据价值)
DROP TABLE IF EXISTS "LAIIllustrationAsset";
