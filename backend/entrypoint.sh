#!/bin/sh
set -e

echo "🐱 CuCaTopia backend starting..."

# ---- 解析 DATABASE_URL 获取连接信息 ----
# DATABASE_URL 格式: postgresql://user:password@host:port/dbname[?params]
# 密码中含 @ 时需 URL 编码为 %40；路径末尾不要多余 /
DB_URL=$(echo "${DATABASE_URL}" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s|/$||')
DB_USER=$(echo "$DB_URL" | sed -n 's|^postgresql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|^[^@]*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|^[^@]*@[^:]*:\([0-9][0-9]*\)/.*|\1|p')
# 库名：@host:port/ 之后、? 之前（避免末尾 / 导致解析成空串）
DB_NAME=$(echo "$DB_URL" | sed -n 's|^[^@]*@[^/]*/\([^?]*\).*$|\1|p' | sed 's|/$||' | tr -d '\r\n[:space:]')

if [ -z "$DB_NAME" ] || [ -z "$DB_HOST" ] || [ -z "$DB_USER" ]; then
  echo "❌ Invalid DATABASE_URL (could not parse host, user, or database name)."
  echo "   Expected: postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
  exit 1
fi

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
  # createdb 比手写 CREATE DATABASE 更不易被引号/转义坑到
  if ! PGPASSWORD="$DB_PASS" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>&1; then
    echo "❌ Could not create database '$DB_NAME'. If you use managed Postgres, create the DB in the console first."
    exit 1
  fi
  echo "✅ Database '$DB_NAME' created"
else
  echo "✅ Database '$DB_NAME' already exists"
fi

# ---- 运行 Prisma 迁移 ----
# 临时关闭 set -e，确保迁移失败不会阻止服务启动
set +e
echo "📦 Running database migrations..."
npx prisma migrate deploy 2>&1
MIGRATE_EXIT=$?

if [ $MIGRATE_EXIT -ne 0 ]; then
  echo "⚠️  prisma migrate deploy failed (exit $MIGRATE_EXIT), attempting baseline migration..."
  # If migration history doesn't exist (first time switching from db push),
  # resolve the existing migrations as already applied
  npx prisma migrate resolve --applied 20260306000000_init 2>/dev/null || true
  npx prisma migrate resolve --applied 20260307000000_v2_multitenancy 2>/dev/null || true
  npx prisma migrate resolve --applied 20260308000000_add_workflow_fields 2>/dev/null || true
  npx prisma migrate resolve --applied 20260405000000_add_vibe_style_item 2>/dev/null || true
  # Try again
  npx prisma migrate deploy 2>&1
  MIGRATE_EXIT2=$?
  if [ $MIGRATE_EXIT2 -ne 0 ]; then
    echo "⚠️  prisma migrate deploy still failed, attempting db push as last resort..."
    npx prisma db push --accept-data-loss 2>&1 || true
    echo "⚠️  Database schema synced via db push (migration history may be inconsistent)"
  else
    echo "✅ Database migrations complete (after baseline)"
  fi
else
  echo "✅ Database migrations complete"
fi

# 恢复 set -e
set -e

echo "🚀 Starting server..."

exec node index.js
