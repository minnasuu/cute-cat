#!/bin/sh
set -e

echo "🐱 CuCaTopia backend starting..."

# Run Prisma migrations safely
# prisma migrate deploy only runs pending migrations, never resets data
echo "📦 Running database migrations..."
npx prisma migrate deploy 2>&1 || {
  echo "⚠️  prisma migrate deploy failed, attempting baseline migration..."
  # If migration history doesn't exist (first time switching from db push),
  # resolve the existing migrations as already applied
  npx prisma migrate resolve --applied 20260306000000_init 2>/dev/null || true
  npx prisma migrate resolve --applied 20260307000000_v2_multitenancy 2>/dev/null || true
  # Try again
  npx prisma migrate deploy
}

echo "✅ Database migrations complete"
echo "🚀 Starting server..."

exec node index.js
