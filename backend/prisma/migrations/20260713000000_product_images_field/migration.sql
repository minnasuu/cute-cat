-- Add images field to LAProduct for storing generated design images as JSON array
-- 设计工作流录入 Lookbook 时把生成的图片一起存下来:[{slot, label, url}]
ALTER TABLE "LAProduct" ADD COLUMN "images" JSONB NOT NULL DEFAULT '[]';
