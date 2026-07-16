-- 品牌信息列重命名：与 schema.prisma 对齐
-- schema 已合并 nameZh/nameEn → name、sloganZh/sloganEn → slogan,
-- 但此前未出迁移,导致数据库仍叫 nameZh/sloganZh → 运行时报 P2022:
--   "The column LABrandProfile.name does not exist in the current database."
-- 修复：把数据库列重命名到 schema 上的名字。保留原值(数据无损);
-- nameEn/sloganEn 已不在 schema 中,Prisma 会忽略数据库里多出的列,留着无副作用。
--
-- 用匿名 DO 块按当前状态幂等执行：只有当源列名仍然存在时才改名，
-- 避免重复部署（首次改名已成功）后源列已不存在而报错。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'LABrandProfile' AND column_name = 'nameZh'
  ) THEN
    ALTER TABLE "LABrandProfile" RENAME COLUMN "nameZh" TO "name";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'LABrandProfile' AND column_name = 'sloganZh'
  ) THEN
    ALTER TABLE "LABrandProfile" RENAME COLUMN "sloganZh" TO "slogan";
  END IF;
END $$;
