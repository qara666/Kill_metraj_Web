#!/bin/bash

# Скрипт запуска локального сервера разработки
# Запускает backend и frontend одновременно

echo "🚀 Запуск локального сервера разработки..."

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден. Установите Node.js для продолжения."
    exit 1
fi

# Проверяем наличие npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm не найден. Установите npm для продолжения."
    exit 1
fi

# Функция для очистки процессов при выходе
cleanup() {
    echo "🛑 Остановка серверов..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Устанавливаем обработчик сигналов
trap cleanup SIGINT SIGTERM

# Переходим в директорию backend
cd backend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей backend..."
    npm install
fi

# Запускаем backend сервер
echo "🔧 Запуск backend сервера на порту 3001..."
npm start &
BACKEND_PID=$!

# Ждем немного чтобы backend запустился
sleep 3

# Переходим в директорию frontend
cd ../frontend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей frontend..."
    npm install
fi

# Запускаем frontend сервер
echo "🌐 Запуск frontend сервера на порту 5173..."
npm run dev &
FRONTEND_PID=$!

echo "✅ Серверы запущены!"
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:3001"
echo "⏹️  Нажмите Ctrl+C для остановки"

# Ждем завершения процессов
wait