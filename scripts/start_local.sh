#!/bin/bash

# Скрипт запуска локального сервера разработки
# Запускает backend и frontend одновременно

echo "🚀 Запуск локального сервера разработки..."

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo " Node.js не найден"
    exit 1
fi

# Проверяем наличие npm
if ! command -v npm &> /dev/null; then
    echo "npm не найден. "
    exit 1
fi

# Функция для очистки процессов при выходе
cleanup() {
    echo "Стоп нах..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

#  обработчик сигналов, можно и не нужно
trap cleanup SIGINT SIGTERM

# Переходим в директорию backend
cd backend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей backend..."
    npm install
fi

# Запускаем bac
echo "Запуск backendа"
npm start &
BACKEND_PID=$!

# Ждем немного чтобы backend запустился
sleep 3

# Переходим в директорию frontend
cd ../frontend

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo " Установка зависимостей фронт..."
    npm install
fi

# Запускаем frontend сервер
echo "Страт фронта сервера"
npm run dev &
FRONTEND_PID=$!

echo "Сервер Запущен!"
echo " Фронт: http://localhost:5173"
echo " Backend: http://localhost:3001"
echo " Нажми Ctrl+C для остановки"

# Ждем завершения процессов
wait