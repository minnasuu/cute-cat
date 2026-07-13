-- LAMaterial: 增加材料参考图
ALTER TABLE "LAMaterial" ADD COLUMN "image" TEXT;

-- LAProduct: 增加设计工作流选定的材料 id(线稿→选材料→成图流程写入)
ALTER TABLE "LAProduct" ADD COLUMN "materialId" TEXT;
