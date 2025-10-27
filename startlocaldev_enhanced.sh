#!/bin/bash

# Kill Metraj - Enhanced Local Development Startup Script
echo "🚀 Запуск Kill Metraj локального сервера разработки..."

# Функция для проверки статуса сервера
check_server() {
    local url=$1
    local name=$2
    local max_attempts=60
    local attempt=1
    
    echo "⏳ Проверка $name..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
            echo "✅ $name готов!"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo "❌ $name не отвечает после $max_attempts попыток"
    return 1
}

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

# Ждем завершения процессов
sleep 2

# Запускаем серверы
echo "🚀 Запуск серверов..."
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5001"
echo ""

# Запускаем в фоне
npm run startlocaldev &
SERVER_PID=$!

# Ждем запуска серверов
sleep 5

# Проверяем статус серверов
if check_server "http://localhost:5001/api/health" "Backend сервер" && \
   check_server "http://localhost:5173" "Frontend сервер"; then
    echo ""
    echo "🎉 Все серверы запущены успешно!"
    echo ""
    echo "📱 Открываем браузер..."
    sleep 2
    open http://localhost:5173
    echo ""
    echo "Для остановки нажмите Ctrl+C"
    echo ""
    
    # Ждем завершения
    wait $SERVER_PID
else
    echo ""
    echo "❌ Не удалось запустить серверы. Проверьте логи выше."
    echo "📜 Последние строки лога backend:" 
    if [ -f ".backend.out.log" ]; then
      tail -n 200 ".backend.out.log"
    else
      echo "Лог .backend.out.log не найден."
    fi
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi






