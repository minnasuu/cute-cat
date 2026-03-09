#!/bin/bash
set -e

echo "🐱 Starting CuCaTopia..."

# Load .env if exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

docker-compose up -d --build

echo ""
echo "✅ CuCaTopia is running!"
echo "   Frontend: http://localhost:4000"
echo "   Backend:  http://localhost:8002"
echo "   Database: localhost:5432"
