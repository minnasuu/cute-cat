-- Add LAProduct.html: stores self-contained HTML document for illustration HTML mode
ALTER TABLE "LAProduct" ADD COLUMN IF NOT EXISTS "html" TEXT;
