#!/bin/bash

# Start System Script
# Starts the backend and background workers using PM2

echo "============================================================"
echo "Starting Kill Metraj System"
echo "============================================================"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 PM2 not found. Installing global dependency..."
    npm install -g pm2
fi

# Go to backend directory
cd "$(dirname "$0")/.."

# Check if .env has API key
if grep -q "EXTERNAL_API_KEY=your_api_key_here" .env; then
    echo "⚠️  WARNING: EXTERNAL_API_KEY is not set in backend/.env"
    echo "   Background worker will fail to fetch data."
    echo "   Please update .env with the correct API key."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🚀 Starting processes with PM2..."
pm2 start ecosystem.config.js

echo ""
echo "✅ System started!"
echo "------------------------------------------------------------"
echo "📊 Monitoring:    pm2 monit"
echo "📝 Logs:          pm2 logs"
echo "🛑 Stop:          pm2 stop all"
echo "------------------------------------------------------------"
