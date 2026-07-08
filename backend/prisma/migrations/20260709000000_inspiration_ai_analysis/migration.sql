-- Add AI analysis fields to LAInspirationAsset
ALTER TABLE "LAInspirationAsset" ADD COLUMN "designHighlights" JSON NOT NULL DEFAULT '[]';
ALTER TABLE "LAInspirationAsset" ADD COLUMN "styleFeatures" JSON NOT NULL DEFAULT '[]';
