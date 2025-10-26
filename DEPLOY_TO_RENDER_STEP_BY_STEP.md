# 🚀 Пошаговый деплой Backend на Render

## ✅ Что уже готово

1. ✅ Frontend настроен на `https://killmetraj-backend.onrender.com`
2. ✅ Backend код готов (`simple_server.js`)
3. ✅ `Procfile` создан
4. ✅ `package.json` с зависимостями
5. ✅ `render.yaml` настроен

## 📋 Шаги для деплоя

### 1. Закоммитить и запушить изменения

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"

# Проверить статус
git status

# Добавить изменения
git add .

# Создать commit
git commit -m "Prepare backend for Render deploy"

# Запушить на GitHub
git push origin main
```

### 2. Создать новый Web Service на Render

1. Перейдите на https://dashboard.render.com
2. Нажмите **"New +"** → **"Web Service"**
3. Выберите репозиторий: **qara666/Kill_metraj_Web**
4. Нажмите **"Connect"**

### 3. Настроить сервис

**Basic Settings:**
- **Name:** `killmetraj-backend`
- **Region:** `Singapore` (или ближайший к вам)
- **Branch:** `main`
- **Root Directory:** `backend`
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `node simple_server.js`

### 4. Добавить Environment Variables

В разделе **"Environment"** добавьте:

```
NODE_ENV=production
PORT=10000
```

### 5. Выбрать план

- **Plan:** `Free`

### 6. Запустить деплой

Нажмите **"Create Web Service"**

Render автоматически:
- ✅ Получит код из GitHub
- ✅ Установит зависимости (`npm install`)
- ✅ Запустит сервер (`node simple_server.js`)
- ✅ Создаст URL (например, `https://killmetraj-backend-xyz.onrender.com`)

### 7. Обновить URL в frontend (если нужен другой)

Если Render создал другой URL (например, `killmetraj-backend-abc123.onrender.com`), обновите:

```typescript
// frontend/src/services/api.ts
const response = await fetch('https://YOUR-NEW-URL.onrender.com/api/upload/excel', {

// frontend/src/services/cloudSync.ts
this.apiUrl = options.apiUrl || 'https://YOUR-NEW-URL.onrender.com'
```

Затем:
```bash
cd frontend
npm run build
```

И задеплойте frontend на Render с новым build.

### 8. Проверить работу

```bash
# Проверить health
curl https://killmetraj-backend.onrender.com/api/health

# Должно вернуть: {"status":"healthy","timestamp":"..."}
```

## ⚠️ Важные моменты

### Free план на Render

- **"Засыпает"** после 15 минут неактивности
- **Первый запуск** может занять 1-2 минуты
- **Restart** доступен в dashboard Render

### CORS настроен правильно

Backend уже настроен для работы с:
- ✅ `https://kill-metraj-frontend.onrender.com`
- ✅ `http://localhost:5173`

## 🔧 Если проблемы

### Backend не запускается

Проверьте логи в Render Dashboard → **"Logs"**

Возможные проблемы:
- Нет `package.json` в `backend/` - добавьте
- Неправильный `Start Command` - должно быть `node simple_server.js`
- Порт не тот - проверьте `PORT=10000` в environment variables

### Connection refused

1. Проверьте что backend запущен на Render
2. Проверьте URL в frontend
3. Проверьте CORS настройки

### 502 Bad Gateway

Backend "заснул". Нажмите **"Manual Deploy"** в Render Dashboard

## ✅ После успешного деплоя

Backend будет доступен на `https://killmetraj-backend.onrender.com` и frontend сможет загружать Excel файлы!

## 📝 Структура файлов

```
backend/
├── simple_server.js         ← Главный сервер
├── package.json             ← Зависимости
├── Procfile                  ← Команда запуска
├── render.yaml               ← Конфигурация Render
└── src/
    └── services/
        └── ExcelService_v3.js  ← Обработка Excel
```

Все файлы готовы для деплоя! 🚀

