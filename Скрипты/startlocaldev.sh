#!/bin/bash

# Простой скрипт быстрого запуска
# Минимальная версия для быстрого старта

echo "🚀 Быстрый запуск..."

# Переходим в директорию backend
cd backend
npm start &
BACKEND_PID=$!

# Ждем
sleep 2

# Переходим в директорию frontend
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "✅ Серверы запущены!"
echo "📱 http://localhost:5173"
echo "🔧 http://localhost:3001"

# Обработчик для остановки
cleanup() {
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

wait
