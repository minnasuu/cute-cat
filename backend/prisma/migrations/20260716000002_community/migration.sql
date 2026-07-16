-- 社区:LAProduct.isPublic + CommunityPost 表

ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "CommunityPost" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "content"       TEXT,
    "images"        JSONB NOT NULL DEFAULT '[]',
    "refProductId"  TEXT,
    "likes"         INTEGER NOT NULL DEFAULT 0,
    "pinned"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommunityPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityPost_refProductId_fkey" FOREIGN KEY ("refProductId") REFERENCES "LAProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CommunityPost_type_createdAt_idx" ON "CommunityPost"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityPost_userId_idx" ON "CommunityPost"("userId");
CREATE INDEX IF NOT EXISTS "CommunityPost_refProductId_idx" ON "CommunityPost"("refProductId");
