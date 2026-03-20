#!/bin/bash

set -e

echo "🚀 Driver Microservice DB Setup"
echo "==============================="

echo ""
echo "1️⃣ Checking environment..."

if [ ! -f ".env" ]; then
  echo "❌ .env missing"
  echo "Copy .env.example"
  exit 1
fi

echo "✅ env ok"

echo ""
echo "2️⃣ Installing dependencies..."

npm install

echo "✅ deps installed"

echo ""
echo "3️⃣ Running migrations..."

npm run db:migrate

echo "✅ migrations applied"

echo ""
echo "4️⃣ Creating superadmin..."

npm run init:superadmin || true

echo "✅ superadmin ready"

echo ""
echo "5️⃣ Verifying schema..."

npm run db:verify

echo ""

echo "🎉 Database ready for development"
