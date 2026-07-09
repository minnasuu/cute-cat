-- Add new AI analysis fields (4 dimensions: visualStyle, designApproach, inspiration)
-- Old fields (silhouette, colors, brandAnalysis, designHighlights, styleFeatures) kept for backward compatibility

ALTER TABLE "LAInspirationAsset" ADD COLUMN "visualStyle" TEXT;
ALTER TABLE "LAInspirationAsset" ADD COLUMN "designApproach" TEXT;
ALTER TABLE "LAInspirationAsset" ADD COLUMN "inspiration" JSONB NOT NULL DEFAULT '[]';
