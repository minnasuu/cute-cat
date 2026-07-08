-- Add analysisError to LAInspirationAsset (AI 分析失败原因: key | file:路径 | mime | api:状态码 | json | empty | net:错误名 | exception:信息)
ALTER TABLE "LAInspirationAsset" ADD COLUMN "analysisError" TEXT;
