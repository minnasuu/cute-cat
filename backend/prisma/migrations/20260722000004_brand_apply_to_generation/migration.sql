-- 品牌资料新增 applyToGeneration 开关(应用到生成)
-- 开启后工作台创作生成图片时自动带入品牌 LOGO/Slogan,默认开启

ALTER TABLE "LABrandProfile" ADD COLUMN IF NOT EXISTS "applyToGeneration" BOOLEAN NOT NULL DEFAULT true;
