-- 品牌信息列重命名：与 schema.prisma 对齐
-- schema 已合并 nameZh/nameEn → name、sloganZh/sloganEn → slogan,
-- 但此前未出迁移,导致数据库仍叫 nameZh/sloganZh → 运行时报 P2022:
--   "The column LABrandProfile.name does not exist in the current database."
-- 修复：把数据库列重命名到 schema 上的名字。保留原值(数据无损);
-- nameEn/sloganEn 已不在 schema 中,Prisma 会忽略数据库里多出的列,留着无副作用。

ALTER TABLE "LABrandProfile" RENAME COLUMN "nameZh" TO "name";
ALTER TABLE "LABrandProfile" RENAME COLUMN "sloganZh" TO "slogan";
