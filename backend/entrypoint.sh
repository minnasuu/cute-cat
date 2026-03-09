#!/bin/sh
set -e

echo "🐱 CuCaTopia backend starting..."

# ---- 解析 DATABASE_URL 获取连接信息 ----
# DATABASE_URL 格式: postgresql://user:password@host:port/dbname
DB_URL="${DATABASE_URL}"
DB_USER=$(echo "$DB_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

echo "📡 Database config: host=$DB_HOST port=$DB_PORT db=$DB_NAME"

# ---- 等待 PostgreSQL 服务就绪 ----
echo "⏳ Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if PGPASSWORD="$DB_PASS" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
    break
  fi
  RETRY=$((RETRY + 1))
  echo "   Waiting... ($RETRY/$MAX_RETRIES)"
  sleep 2
done

if [ $RETRY -eq $MAX_RETRIES ]; then
  echo "❌ PostgreSQL did not become ready in time"
  exit 1
fi

# ---- 确保目标数据库存在 ----
echo "🔍 Checking if database '$DB_NAME' exists..."
DB_EXISTS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" != "1" ]; then
  echo "📦 Database '$DB_NAME' does not exist, creating..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";" 2>&1
  echo "✅ Database '$DB_NAME' created"
else
  echo "✅ Database '$DB_NAME' already exists"
fi

# ---- 运行 Prisma 迁移 ----
echo "📦 Running database migrations..."
npx prisma migrate deploy 2>&1 || {
  echo "⚠️  prisma migrate deploy failed, attempting baseline migration..."
  # If migration history doesn't exist (first time switching from db push),
  # resolve the existing migrations as already applied
  npx prisma migrate resolve --applied 20260306000000_init 2>/dev/null || true
  npx prisma migrate resolve --applied 20260307000000_v2_multitenancy 2>/dev/null || true
  npx prisma migrate resolve --applied 20260308000000_add_workflow_fields 2>/dev/null || true
  # Try again
  npx prisma migrate deploy
}

echo "✅ Database migrations complete"
echo "🚀 Starting server..."

exec node index.js
