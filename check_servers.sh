#!/bin/bash

# Kill Metraj - Server Status Check Script
echo "🔍 Проверка статуса серверов Kill Metraj..."

# Функция для проверки статуса сервера
check_server_status() {
    local url=$1
    local name=$2
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
        echo "✅ $name: Работает"
        return 0
    else
        echo "❌ $name: Не отвечает"
        return 1
    fi
}

echo ""
echo "Проверяем серверы..."

# Проверяем backend
check_server_status "http://localhost:5001/api/health" "Backend сервер (порт 5001)"

# Проверяем frontend
check_server_status "http://localhost:5173" "Frontend сервер (порт 5173)"

echo ""
echo "📊 Дополнительная информация:"

# Проверяем процессы
echo "🔍 Запущенные процессы:"
ps aux | grep -E "(vite|simple_server)" | grep -v grep || echo "   Нет запущенных процессов"

echo ""
echo "🌐 URL для доступа:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5001"
echo "   API Health: http://localhost:5001/api/health"
echo "   Debug Logs: http://localhost:5001/debug/logs"




