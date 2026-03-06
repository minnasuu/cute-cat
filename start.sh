#!/bin/bash
set -e

echo "🐱 Starting Cute Cat..."

# Load .env if exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

docker-compose up -d --build

echo ""
echo "✅ Cute Cat is running!"
echo "   Frontend: http://localhost:8080"
echo "   Backend:  http://localhost:8001"
echo "   Database: localhost:5432"
