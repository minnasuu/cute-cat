-- Add imageUrl to LAProduct (Lookbook 产品主图,支持弹窗本地上传替换)
ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
