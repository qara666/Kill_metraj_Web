#!/bin/zsh

# Скрипт для запуска проекта и открытия в Safari

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"

# Делаем скрипт исполняемым
chmod +x "$DIR/start_local.sh"

# Функция для очистки процессов при выходе
cleanup() {
    echo ""
    echo "🛑 Остановка серверов..."
    # Находим и убиваем процессы node связанные с проектом
    pkill -f "node.*simple_server.js" 2>/dev/null
    pkill -f "vite.*5173" 2>/dev/null
    pkill -f "npm.*start" 2>/dev/null
    pkill -f "npm.*dev" 2>/dev/null
    exit 0
}

# Устанавливаем обработчик сигналов
trap cleanup SIGINT SIGTERM

echo "🚀 Запуск проекта..."

# Запускаем скрипт start_local.sh в фоне
cd "$PROJECT_DIR"
"$DIR/start_local.sh" > /tmp/kill_metraj_start.log 2>&1 &
START_SCRIPT_PID=$!

# Ждем запуска серверов
echo "⏳ Ожидание запуска серверов..."
sleep 5

# Проверяем, что frontend сервер запущен
FRONTEND_URL="http://localhost:5173"
MAX_ATTEMPTS=20
ATTEMPT=0

echo "🔍 Проверка доступности сервера..."

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # Проверяем доступность через curl
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "000" ]; then
        # Если получили ответ (даже 404) или curl не доступен, пробуем открыть
        if [ "$HTTP_CODE" != "000" ] || [ $ATTEMPT -gt 5 ]; then
            echo "✅ Сервер доступен!"
            break
        fi
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    if [ $((ATTEMPT % 3)) -eq 0 ]; then
        echo "   Попытка $ATTEMPT/$MAX_ATTEMPTS..."
    fi
    sleep 1
done

# Открываем Safari с адресом frontend
echo "🌐 Открытие Safari..."
open -a Safari "$FRONTEND_URL"

echo ""
echo "✅ Проект запущен в режиме разработки!"
echo "📱 Frontend: $FRONTEND_URL"
echo "🔧 Backend: http://localhost:5001"
echo "📋 Логи: /tmp/kill_metraj_start.log"
echo ""
echo "⏹️  Нажмите Ctrl+C для остановки (авто-перезагрузка включена)"
echo ""

# Ждем завершения процессов (или бесконечно, пока пользователь не остановит)
wait $START_SCRIPT_PID 2>/dev/null || while true; do sleep 1; done



