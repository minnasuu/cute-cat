-- 为 LAProduct 新增 outfits 字段(穿搭效果图:每次「穿搭效果」生成追加到参与单品)

ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "outfits" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "LAProduct_outfits_idx" ON "LAProduct" USING GIN ("outfits");
