#!/bin/sh
set -e

echo "🐱 CuCaTopia backend starting..."

# ---- 解析 DATABASE_URL 获取 host/port/dbname；密码优先用环境变量（与 docker-compose db 一致）----
# DATABASE_URL 格式: postgresql://user:password@host:port/dbname[?params]
# 若只从 URL 里 sed 取密码，密码中含 @ # : 等会截断，导致「方案 A」删卷后仍认证失败。
DB_URL=$(echo "${DATABASE_URL}" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s|/$||')
DB_USER=$(echo "$DB_URL" | sed -n 's|^postgresql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|^[^@]*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|^[^@]*@[^:]*:\([0-9][0-9]*\)/.*|\1|p')
# 库名：@host:port/ 之后、? 之前（避免末尾 / 导致解析成空串）
DB_NAME=$(echo "$DB_URL" | sed -n 's|^[^@]*@[^/]*/\([^?]*\).*$|\1|p' | sed 's|/$||' | tr -d '\r\n[:space:]')

# 与 compose 中 POSTGRES_USER / POSTGRES_PASSWORD 对齐（去掉 Windows 换行）
if [ -n "${POSTGRES_USER}" ]; then
  DB_USER=$(echo "$POSTGRES_USER" | tr -d '\r')
fi
if [ -n "${POSTGRES_PASSWORD}" ]; then
  DB_PASS=$(echo "$POSTGRES_PASSWORD" | tr -d '\r')
fi

if [ -z "$DB_NAME" ] || [ -z "$DB_HOST" ] || [ -z "$DB_USER" ]; then
  echo "❌ Invalid DATABASE_URL (could not parse host, user, or database name)."
  echo "   Expected: postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
  exit 1
fi

echo "📡 Database config: host=$DB_HOST port=$DB_PORT db=$DB_NAME user=$DB_USER (password len=${#DB_PASS})"

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

# pg_isready 不校验密码；这里必须能连上 postgres 库，否则后面 createdb 会报 FATAL: password authentication failed
echo "🔐 Verifying database password (same as DATABASE_URL)..."
if ! PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc 'SELECT 1' > /dev/null 2>&1; then
  echo "❌ Password authentication failed for user \"$DB_USER\"."
  echo "   Common causes:"
  echo "   1) Postgres volume still old: list and remove the correct volume, then up again:"
  echo "           docker volume ls | grep -i postgres"
  echo "           docker compose down && docker volume rm <上面列出的卷名>"
  echo "   2) .env 里 POSTGRES_PASSWORD 与之前初始化数据目录时不一致（改密码不会自动改卷内密码）。"
  echo "   3) 密码含 @ 等：已优先读环境变量 POSTGRES_PASSWORD；请重建 backend 镜像并勿用 sed 易截断的 URL。"
  echo "   4) .env 中行末空格、Windows 换行、或密码里的 #（被当成注释）— 检查 POSTGRES_PASSWORD 一行。"
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
    echo "🔴 prisma migrate deploy still failed after baseline!"
    echo "🔴 NOT running 'db push --accept-data-loss' to protect user data."
    echo "🔴 Attempting safe 'db push' without data loss flag..."
    npx prisma db push 2>&1
    PUSH_EXIT=$?
    if [ $PUSH_EXIT -ne 0 ]; then
      echo "🔴 db push also failed. Starting server anyway — schema may be outdated."
      echo "🔴 Please manually run: npx prisma migrate deploy"
    else
      echo "✅ Database schema synced via safe db push"
    fi
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
