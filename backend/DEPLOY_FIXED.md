# Исправленный деплой Backend на Render

## ✅ Что исправлено:

1. package.json - исправлен main файл на simple_server.js
2. Procfile - создан для Render  
3. render.yaml - обновлен с правильными настройками
4. Зависимости - все установлены и протестированы
5. Сервер - запускается без ошибок

## 📋 Пошаговая инструкция:

### 1. Подготовка репозитория
git add .
git commit -m "Fix backend deployment for Render"
git push origin main

### 2. Создание Web Service на Render
1. Перейдите на https://render.com
2. Нажмите "New" → "Web Service"
3. Подключите ваш GitHub репозиторий
4. Выберите репозиторий с проектом

### 3. Настройки сервиса
- Name: killmetraj-backend
- Environment: Node
- Region: Oregon (US West)
- Branch: main
- Root Directory: backend
- Build Command: npm install
- Start Command: node simple_server.js
- Plan: Free

### 4. Переменные окружения
- NODE_ENV = production
- PORT = 10000

### 5. Проверка работы
URL: https://killmetraj-backend.onrender.com
Тест: curl https://killmetraj-backend.onrender.com/api/health
