#!/bin/bash

echo "🚀 Запуск Kill_metraj для локальной разработки"
echo ""

# Проверить backend
echo "1️⃣ Проверка backend..."
if curl -s http://localhost:10000/api/health > /dev/null; then
    echo "✅ Backend запущен на http://localhost:10000"
else
    echo "⚠️ Backend не запущен. Запускаю..."
    cd backend
    node simple_server.js &
    sleep 2
    cd ..
    echo "✅ Backend запущен"
fi

echo ""
echo "2️⃣ Запуск frontend..."
cd frontend
npm run dev

