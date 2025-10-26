#!/bin/bash

# Быстрые команды для деплоя на Render

echo "🚀 Подготовка к деплою на Render..."
echo ""

# Проверить статус
echo "📋 Текущий статус:"
git status

echo ""
echo "✅ Измененные файлы:"
echo "  - frontend/src/services/api.ts → https://killmetraj-backend.onrender.com"
echo "  - frontend/src/services/cloudSync.ts → https://killmetraj-backend.onrender.com"
echo ""

read -p "Зафиксировать изменения и запушить? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "📦 Добавляю изменения..."
    git add .
    
    echo "💾 Создаю commit..."
    git commit -m "Prepare backend for Render deploy with proper URL configuration"
    
    echo "📤 Пущу на GitHub..."
    git push origin main
    
    echo ""
    echo "✅ Изменения запушены на GitHub!"
    echo ""
    echo "📝 Следующие шаги:"
    echo "1. Откройте https://dashboard.render.com"
    echo "2. Нажмите 'New +' → 'Web Service'"
    echo "3. Выберите репозиторий: qara666/Kill_metraj_Web"
    echo "4. Root Directory: backend"
    echo "5. Build Command: npm install"
    echo "6. Start Command: node simple_server.js"
    echo "7. Environment: NODE_ENV=production, PORT=10000"
    echo "8. Нажмите 'Create Web Service'"
    echo ""
    echo "🔗 Backend будет доступен на: https://killmetraj-backend.onrender.com"
    echo "✅ Frontend уже настроен на этот URL!"
else
    echo "❌ Отменено"
fi

