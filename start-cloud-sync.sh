#!/bin/bash

# Скрипт для запуска облачной синхронизации
echo "🚀 Запуск облачной синхронизации..."

# Переходим в директорию backend
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

# Запускаем облачную синхронизацию
echo "☁️ Запуск API облачной синхронизации на порту 3001..."
node src/cloudSync.js

