#!/bin/bash

# Скрипт проверки состояния серверов


echo " Проверка состояния серверов..."

# Функция проверки порта
check_port() {
    local port=$1
    local service=$2
    
    if curl -s "http://localhost:$port" > /dev/null 2>&1; then
        echo " $service (порт $port) - работает"
        return 0
    else
        echo " $service (порт $port) - Не блд не работает"
        return 1
    fi
}

# Проверяем backend
check_port 3001 "Бэк апи"

# Проверяем frontend
check_port 5173 "Фронт сер"

echo "Контекст завершен"
