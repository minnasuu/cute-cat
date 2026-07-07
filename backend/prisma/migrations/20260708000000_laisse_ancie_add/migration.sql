-- Laisse Ancie 品牌服装工作室
-- 8 张新表：品牌信息 + 视觉资产 + 灵感 + 面料·工艺 + 知识库 + 设计产品 + 系列

-- CreateTable: LABrandProfile
CREATE TABLE "LABrandProfile" (
    "id"             TEXT NOT NULL,
    "teamId"         TEXT NOT NULL,
    "nameZh"         TEXT NOT NULL,
    "nameEn"         TEXT NOT NULL,
    "cnFont"         TEXT NOT NULL DEFAULT '站酷xiaowei体',
    "enFont"         TEXT NOT NULL DEFAULT 'Poller One',
    "sloganZh"       TEXT NOT NULL,
    "sloganEn"       TEXT NOT NULL,
    "greetingEn"     TEXT,
    "voice"          JSONB NOT NULL DEFAULT '["优雅","松弛","乐趣"]',
    "audienceAgeMin" INTEGER NOT NULL DEFAULT 18,
    "audienceAgeMax" INTEGER NOT NULL DEFAULT 30,
    "priceMin"       INTEGER NOT NULL DEFAULT 20,
    "priceMax"       INTEGER NOT NULL DEFAULT 500,
    "systemSnippet"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LABrandProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LABrandProfile_teamId_key" ON "LABrandProfile"("teamId");

-- CreateTable: LAColorPair
CREATE TABLE "LAColorPair" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "bg"        TEXT NOT NULL,
    "fg"        TEXT NOT NULL,
    "usage"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LAColorPair_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LAColorPair_teamId_idx" ON "LAColorPair"("teamId");

-- CreateTable: LAVisualAsset
CREATE TABLE "LAVisualAsset" (
    "id"          TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "src"         TEXT NOT NULL,
    "tags"        JSONB NOT NULL DEFAULT '[]',
    "seasons"     JSONB,
    "pinned"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LAVisualAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LAVisualAsset_teamId_idx" ON "LAVisualAsset"("teamId");
CREATE INDEX "LAVisualAsset_kind_idx" ON "LAVisualAsset"("kind");

-- CreateTable: LAInspirationAsset
CREATE TABLE "LAInspirationAsset" (
    "id"            TEXT NOT NULL,
    "teamId"        TEXT NOT NULL,
    "url"           TEXT NOT NULL,
    "thumbUrl"      TEXT,
    "mime"          TEXT NOT NULL,
    "bytes"         INTEGER NOT NULL,
    "width"         INTEGER NOT NULL DEFAULT 0,
    "height"        INTEGER NOT NULL DEFAULT 0,
    "category"      TEXT,
    "silhouette"    TEXT,
    "colors"        JSONB NOT NULL DEFAULT '[]',
    "brandAnalysis" TEXT,
    "useCount"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LAInspirationAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LAInspirationAsset_teamId_idx" ON "LAInspirationAsset"("teamId");
CREATE INDEX "LAInspirationAsset_category_idx" ON "LAInspirationAsset"("category");

-- CreateTable: LAMaterial
CREATE TABLE "LAMaterial" (
    "id"          TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "supplier"    TEXT,
    "origin"      TEXT,
    "colors"      JSONB NOT NULL,
    "composition" TEXT,
    "weight"      TEXT,
    "texture"     TEXT,
    "finish"      TEXT,
    "width"       TEXT,
    "thickness"   TEXT,
    "diameter"    TEXT,
    "size"        TEXT,
    "tex"         TEXT,
    "shape"       TEXT,
    "originNote"  TEXT,
    "care"        JSONB NOT NULL DEFAULT '[]',
    "uses"        JSONB NOT NULL DEFAULT '[]',
    "seasons"     JSONB NOT NULL DEFAULT '[]',
    "notes"       TEXT,
    "priceAmount" DOUBLE PRECISION,
    "priceCur"    TEXT,
    "priceUnit"   TEXT,
    "priceNote"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LAMaterial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LAMaterial_teamId_idx" ON "LAMaterial"("teamId");
CREATE INDEX "LAMaterial_category_idx" ON "LAMaterial"("category");

-- CreateTable: LASkillArticle
CREATE TABLE "LASkillArticle" (
    "id"               TEXT NOT NULL,
    "teamId"           TEXT NOT NULL,
    "category"         TEXT NOT NULL,
    "title"            TEXT NOT NULL,
    "zhTitle"          TEXT NOT NULL,
    "body"             TEXT NOT NULL,
    "tags"             JSONB NOT NULL DEFAULT '[]',
    "relatedProducts"  JSONB NOT NULL DEFAULT '[]',
    "relatedMaterials" JSONB NOT NULL DEFAULT '[]',
    "systemHint"       TEXT,
    "pinned"           BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LASkillArticle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LASkillArticle_teamId_idx" ON "LASkillArticle"("teamId");
CREATE INDEX "LASkillArticle_category_idx" ON "LASkillArticle"("category");

-- CreateTable: LACollection
CREATE TABLE "LACollection" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "mode"         TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "occasion"     TEXT,
    "theme"        TEXT,
    "seasons"      JSONB NOT NULL DEFAULT '[]',
    "palette"      JSONB NOT NULL DEFAULT '[]',
    "designerNote" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LACollection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LACollection_teamId_idx" ON "LACollection"("teamId");

-- CreateTable: LAProduct
CREATE TABLE "LAProduct" (
    "id"                TEXT NOT NULL,
    "teamId"            TEXT NOT NULL,
    "mode"              TEXT NOT NULL,
    "collectionId"      TEXT,
    "title"             TEXT NOT NULL,
    "description"       TEXT NOT NULL DEFAULT '',
    "seasons"           JSONB NOT NULL DEFAULT '[]',
    "category"          TEXT,
    "colors"            JSONB NOT NULL DEFAULT '[]',
    "targetPriceNum"    INTEGER,
    "silhouette"        TEXT,
    "fabricId"          TEXT,
    "fabricComposition" TEXT,
    "liningId"          TEXT,
    "liningComposition" TEXT,
    "trimIds"           JSONB,
    "stitchNotes"       TEXT,
    "measureTable"      TEXT,
    "gradingNotes"      TEXT,
    "patternUrl"        TEXT,
    "techPackUrl"       TEXT,
    "aiDraftRaw"        TEXT,
    "fitAcknowledge"    TEXT,
    "fitDetail"         TEXT,
    "patternFinalUrl"   TEXT,
    "factory"           TEXT,
    "factoryContact"    TEXT,
    "moq"               INTEGER,
    "qty"               INTEGER,
    "unitCostNum"       DOUBLE PRECISION,
    "leadDays"          INTEGER,
    "fabricSource"      TEXT,
    "trimSource"        TEXT,
    "fqcResult"         TEXT,
    "sku"               TEXT,
    "barcode"           TEXT,
    "whLocation"        TEXT,
    "status"            TEXT NOT NULL DEFAULT 'draft',
    "statusHistory"     JSONB NOT NULL DEFAULT '[]',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LAProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LAProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "LACollection"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LAProduct_teamId_idx" ON "LAProduct"("teamId");
CREATE INDEX "LAProduct_mode_idx" ON "LAProduct"("mode");
CREATE INDEX "LAProduct_status_idx" ON "LAProduct"("status");
CREATE INDEX "LAProduct_collectionId_idx" ON "LAProduct"("collectionId");
