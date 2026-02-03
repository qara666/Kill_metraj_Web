#!/bin/bash

# Start System Script
# Starts the backend and background workers using PM2

echo "============================================================"
echo "Запуск системы Kill Metraj"
echo "============================================================"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 не найден. Установка глобальной зависимости..."
    npm install -g pm2
fi

# Go to backend directory
cd "$(dirname "$0")/.."

# Check if .env has API key
if grep -q "EXTERNAL_API_KEY=your_api_key_here" .env; then
    echo "[!] ПРЕДУПРЕЖДЕНИЕ: EXTERNAL_API_KEY не установлен в backend/.env"
    echo "    Фоновый воркер не сможет получать данные."
    echo "    Пожалуйста, обновите .env правильным API ключом."
    echo ""
    read -p "Продолжить в любом случае? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Запуск процессов через PM2..."
pm2 start ecosystem.config.js

echo ""
echo "Система запущена!"
echo "------------------------------------------------------------"
echo "Мониторинг:       pm2 monit"
echo "Логи:             pm2 logs"
echo "Остановка:        pm2 stop all"
echo "------------------------------------------------------------"
