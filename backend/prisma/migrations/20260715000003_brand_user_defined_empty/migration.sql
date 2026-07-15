-- 品牌信息改为用户自定义、默认空值
--   1. 新增 logo 列(品牌标识图 URL)
--   2. nameZh/nameEn/sloganZh/sloganEn 改为可空(新用户默认不再预填 demo 品牌)
--   3. 移除 greetingEn(开场问候已下线,由 AI 侧按需生成)
--   4. voice 默认值改为空数组(由 schema @default 兜底,此处显式刷新默认值)

ALTER TABLE "LABrandProfile" ADD COLUMN IF NOT EXISTS "logo" TEXT;

ALTER TABLE "LABrandProfile" ALTER COLUMN "nameZh" DROP NOT NULL;
ALTER TABLE "LABrandProfile" ALTER COLUMN "nameEn" DROP NOT NULL;
ALTER TABLE "LABrandProfile" ALTER COLUMN "sloganZh" DROP NOT NULL;
ALTER TABLE "LABrandProfile" ALTER COLUMN "sloganEn" DROP NOT NULL;

ALTER TABLE "LABrandProfile" DROP COLUMN IF EXISTS "greetingEn";

ALTER TABLE "LABrandProfile" ALTER COLUMN "voice" SET DEFAULT '[]';
