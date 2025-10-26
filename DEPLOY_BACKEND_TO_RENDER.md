# Деплой Backend на Render

## ⚠️ Проблема
Backend на Render не запущен (возвращает 404). Нужно задеплоить backend.

## 🚀 Шаги для деплоя на Render

### 1. Создать новый сервис на Render

1. Перейдите на https://render.com
2. Войдите в аккаунт
3. Нажмите "New +" → "Web Service"
4. Подключите GitHub репозиторий: `qara666/Kill_metraj_Web`

### 2. Настройки для Backend

**Root Directory:** `backend`  
**Environment:** `Node`  
**Build Command:** `npm install`  
**Start Command:** `node simple_server.js`  
**Plan:** `Free`  

### 3. Environment Variables

Добавьте следующие переменные:
```
NODE_ENV=production
PORT=10000
```

### 4. Запушить изменения в GitHub

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"

# Создать commit
git add .
git commit -m "Fix address errors and prepare for Render deploy"

# Запушить на GitHub
git push origin main
```

### 5. Автоматический деплой

Render автоматически:
- Получит код из GitHub
- Установит зависимости (`npm install`)
- Запустит сервер (`node simple_server.js`)
- Создаст URL (например, `https://killmetraj-backend-xyz.onrender.com`)

### 6. Обновить URL в frontend

После деплоя обновите URL в frontend:
```typescript
// frontend/src/services/api.ts
const response = await fetch('https://YOUR-NEW-BACKEND-URL.onrender.com/api/upload/excel', {
  method: 'POST',
  body: formData,
})
```

## 📝 Альтернатива: Использовать локальный backend

Если не хотите деплоить на Render, можете использовать локальный backend:

1. Запустите backend локально:
```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"
npm install
node simple_server.js
```

2. Обновите URL в frontend:
```typescript
// frontend/src/services/api.ts
const response = await fetch('http://localhost:10000/api/upload/excel', {
  method: 'POST',
  body: formData,
})
```

## ✅ Проверка после деплоя

```bash
# Проверить health endpoint
curl https://YOUR-BACKEND-URL.onrender.com/api/health

# Должно вернуть: {"status":"healthy","timestamp":"..."}
```

## 🔧 Структура backend

```
backend/
├── simple_server.js         # Главный сервер
├── package.json             # Зависимости
├── Procfile                 # Команда запуска для Render
├── render.yaml              # Конфигурация Render
└── src/
    └── services/
        └── ExcelService_v3.js  # Обработка Excel
```

## ⚠️ Важно

1. Backend должен быть всегда запущен для работы с Excel файлами
2. Free план на Render "засыпает" после 15 минут неактивности
3. Первый запуск может занять 1-2 минуты

## 📞 Поддержка

Если проблемы с деплоем, проверьте:
- Логи в Render Dashboard
- GitHub connection в Render
- Environment variables
- Build/Start commands

