-- Add fields to VibeStyleItem
ALTER TABLE "VibeStyleItem"
ADD COLUMN     "isOfficial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Optional indexes for common filters
CREATE INDEX "VibeStyleItem_isOfficial_idx" ON "VibeStyleItem"("isOfficial");
CREATE INDEX "VibeStyleItem_aiEnabled_idx" ON "VibeStyleItem"("aiEnabled");

-- CreateTable: VibeFontAsset
CREATE TABLE "VibeFontAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fileUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "family" TEXT NOT NULL DEFAULT '',
    "tags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VibeFontAsset_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "VibeFontAsset_userId_idx" ON "VibeFontAsset"("userId");
CREATE INDEX "VibeFontAsset_isOfficial_idx" ON "VibeFontAsset"("isOfficial");
CREATE INDEX "VibeFontAsset_aiEnabled_idx" ON "VibeFontAsset"("aiEnabled");

