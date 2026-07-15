-- 品牌信息新增 statusConfig 列(自定义工序状态,供 Lookbook 状态列使用)
-- 例: [{"id":"draft","label":"草稿","color":"#6b7280"},{"id":"live","label":"已上架","color":"#16a34a"}]

ALTER TABLE "LABrandProfile" ADD COLUMN IF NOT EXISTS "statusConfig" JSONB NOT NULL DEFAULT '[]';
