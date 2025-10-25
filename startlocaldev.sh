#!/bin/bash

# Kill Metraj - Local Development Startup Script
echo "🚀 Запуск Kill Metraj локального сервера разработки..."

# Проверяем, что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Ошибка: package.json не найден. Убедитесь, что вы находитесь в корневой директории проекта."
    exit 1
fi

# Проверяем, что node_modules установлены
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "📦 Установка зависимостей backend..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Установка зависимостей frontend..."
    cd frontend && npm install && cd ..
fi

# Останавливаем существующие процессы
echo "🛑 Остановка существующих процессов..."
pkill -f "vite\|simple_server.js" 2>/dev/null || true

# Запускаем серверы
echo "🚀 Запуск серверов..."
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5001"
echo ""
echo "Для остановки нажмите Ctrl+C"
echo ""

npm run startlocaldev




