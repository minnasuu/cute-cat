-- 删除已废弃的 Vibe 灵感库 / 字体资产表
-- 前端 VibeAssets / VibeStyleLib 页面与后端 /api/assets、/api/dify/vibe-snap-* 路由均已移除,
-- schema.prisma 中的 VibeStyleItem / VibeFontAsset 模型也已删除,此处清理数据库残留表。

DROP TABLE IF EXISTS "VibeStyleItem";
DROP TABLE IF EXISTS "VibeFontAsset";
