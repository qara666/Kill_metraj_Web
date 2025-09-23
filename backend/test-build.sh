#!/bin/bash

echo "🔨 Testing TypeScript build for Render deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run from backend directory."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔧 Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Ready for deployment on Render"
    
    # Check if dist directory exists and has files
    if [ -d "dist" ] && [ "$(ls -A dist)" ]; then
        echo "📁 Build output:"
        ls -la dist/
    else
        echo "⚠️  Warning: dist directory is empty or doesn't exist"
    fi
else
    echo "❌ Build failed"
    exit 1
fi


