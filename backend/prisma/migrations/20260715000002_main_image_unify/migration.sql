-- 整合图片字段:主图/线稿/效果图统一进 images[].slot
--   slot="main" → 主图; slot="lineart" → 线稿; 其余(final/material-combo/editorial/flat/render/...) → 效果图

-- 1. 加 sourceImages 列(另一改动加入 schema,此处一并落库,幂等)
ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "sourceImages" JSONB NOT NULL DEFAULT '[]';

-- 2. 回填现有主图:把 imageUrl 移入 images[] 作为 slot="main" 条目,并清空 imageUrl(派生字段由后端在互换时同步)
--    仅处理 imageUrl 非空 且 images[] 中尚无主图条目的行,避免重复
UPDATE "LAProduct"
   SET "images" = jsonb_build_array(
            jsonb_build_object('slot', 'main', 'label', '主图', 'url', "imageUrl")
          ) || "images",
       "imageUrl" = NULL
 WHERE "imageUrl" IS NOT NULL
   AND NOT ("images" @> '[{"slot":"main"}]');
