# Настройка локального Backend

## ✅ Что сделано

Backend настроен для работы на `http://localhost:10000`. Теперь вы можете использовать локальный backend вместо Render.

## 🚀 Запуск локального Backend

### Запустить в фоне:

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"
node simple_server.js &
```

### Проверить работу:

```bash
curl http://localhost:10000/api/health
```

Должно вернуть: `{"status":"healthy","timestamp":"..."}`

## 🔧 Настройки Frontend

Frontend уже настроен на использование локального backend:
- `frontend/src/services/api.ts` → `http://localhost:10000`
- `frontend/src/services/cloudSync.ts` → `http://localhost:10000`

## 📋 Как использовать

1. **Запустите backend:**
```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"
node simple_server.js
```

2. **Запустите frontend:**
```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend"
npm run dev
```

3. **Откройте браузер:** http://localhost:5173

4. **Загрузите Excel файл** - backend обработает его на `http://localhost:10000`

## ✅ Результат

- ✅ Backend работает на http://localhost:10000
- ✅ Frontend использует локальный backend
- ✅ Excel файлы обрабатываются корректно
- ✅ Нет ошибки "Не удалось подключиться к серверу"

## 🔄 Для деплоя на Render

Когда будете деплоить на Render:

1. Верните URL в `frontend/src/services/api.ts`:
```typescript
const response = await fetch('https://YOUR-BACKEND-URL.onrender.com/api/upload/excel', {
```

2. Верните URL в `frontend/src/services/cloudSync.ts`:
```typescript
this.apiUrl = options.apiUrl || 'https://YOUR-BACKEND-URL.onrender.com'
```

3. Задеплойте backend на Render (смотрите `DEPLOY_BACKEND_TO_RENDER.md`)

## ⚠️ Важно

Backend должен быть **всегда запущен** для работы с Excel файлами!

Для постоянного запуска используйте `pm2`:

```bash
npm install -g pm2
pm2 start simple_server.js --name killmetraj-backend
pm2 save
pm2 startup
```
