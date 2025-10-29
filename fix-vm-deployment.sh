#!/bin/bash

echo "🚀 Fixing VM deployment issues..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building the application..."
npm run build

echo "🗄️ Running database migrations..."
npx prisma migrate deploy
npx prisma generate

echo "🔍 Checking if build directory exists..."
if [ -d "build" ]; then
    echo "✅ Build directory exists"
    ls -la build/
else
    echo "❌ Build directory missing - this is the problem!"
    echo "🔨 Rebuilding..."
    npm run build
fi

echo "🔍 Checking if assets exist..."
if [ -d "build/client" ]; then
    echo "✅ Client assets exist"
    ls -la build/client/
else
    echo "❌ Client assets missing!"
fi

echo "🧪 Testing endpoints..."
echo "Testing health endpoint..."
curl -f http://localhost:3000/api/test-draft-automation -X POST || echo "⚠️ Draft automation test failed"

echo "Testing webhook status..."
curl -f http://localhost:3000/api/webhook-status -X POST || echo "⚠️ Webhook status check failed"

echo "🎉 VM deployment fix completed!"
echo ""
echo "📋 Next steps:"
echo "1. Restart the server: pm2 restart shopify-app"
echo "2. Check logs: pm2 logs shopify-app"
echo "3. Test automation: curl -X POST http://localhost:3000/api/test-draft-automation"
echo "4. Check webhook config: curl -X POST http://localhost:3000/api/webhook-status"
echo ""
echo "🔍 To monitor automation:"
echo "   pm2 logs shopify-app | grep -E '(INVENTORY|WEBHOOK|AUTOMATION|DRAFT)'"
