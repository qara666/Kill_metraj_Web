#!/bin/bash

# Запуск локального сервера разработки
# Запускает бэкенд и фронтенд одновременно

echo "Запуск локального сервера разработки..."

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js не найден"
    exit 1
fi

# Проверяем наличие npm
if ! command -v npm &> /dev/null; then
    echo "npm не найден"
    exit 1
fi

# Функция для очистки процессов при выходе
cleanup() {
    echo "Остановка..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Обработчик сигналов
trap cleanup SIGINT SIGTERM

# Переходим в директорию backend
cd backend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей backend..."
    npm install
fi

# Запускаем backend в режиме авто-перезагрузки
echo "Запуск backend..."
npm run dev &
BACKEND_PID=$!

# Ждем немного чтобы backend запустился
sleep 3

# Переходим в директорию frontend
cd ../frontend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей frontend..."
    npm install
fi

# Запускаем frontend сервер
echo "Запуск frontend..."
npm run dev &
FRONTEND_PID=$!

echo "Сервер запущен"
echo "Frontend: http://localhost:5174"
echo "Backend: http://localhost:5001"
echo "Нажми Ctrl+C для остановки"

# Ждем завершения процессов
wait
