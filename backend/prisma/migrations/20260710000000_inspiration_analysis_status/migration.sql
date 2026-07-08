-- Add analysisStatus to LAInspirationAsset (AI 分析状态: pending / success / failed)
ALTER TABLE "LAInspirationAsset" ADD COLUMN "analysisStatus" TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX "LAInspirationAsset_teamId_analysisStatus_idx" ON "LAInspirationAsset"("teamId", "analysisStatus");
