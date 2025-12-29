#!/bin/bash

# Скрипт запуска только frontend сервера
# Полезно когда backend уже запущен отдельно

echo "🌐 Запуск frontend сервера..."

# Переходим в директорию frontend
cd frontend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

# Запускаем frontend сервер
echo "🚀 Frontend сервер запускается на http://localhost:5173"
npm run dev
