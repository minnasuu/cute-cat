-- CreateTable
CREATE TABLE "VibeStyleItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "colors" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "designSummary" JSONB NOT NULL,
    "designPrompt" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VibeStyleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VibeStyleItem_userId_idx" ON "VibeStyleItem"("userId");
