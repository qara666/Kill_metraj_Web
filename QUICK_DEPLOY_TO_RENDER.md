# ⚡ Быстрый деплой на Render

## ✅ Всё готово для деплоя!

URL в frontend настроены на `https://killmetraj-backend.onrender.com`

## 🚀 Шаги деплоя

### 1. Подтвердите изменения в Git

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"

# Проверить статус
git status

# Добавить изменения
git add .

# Создать commit
git commit -m "Prepare backend for Render deploy with proper URL configuration"

# Запушить на GitHub
git push origin main
```

### 2. На Render

1. Откройте https://dashboard.render.com
2. **"New +"** → **"Web Service"**
3. Выберите: **qara666/Kill_metraj_Web**
4. Настройки:
   - **Name:** `killmetraj-backend`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node simple_server.js`
5. Environment Variables:
   ```
   NODE_ENV=production
   PORT=10000
   ```
6. Нажмите **"Create Web Service"**

### 3. Готово!

Backend будет доступен на `https://killmetraj-backend.onrender.com`

Frontend уже настроен на этот URL! ✅

## 🔍 Проверка

После деплоя проверьте:
```bash
curl https://killmetraj-backend.onrender.com/api/health
```

## ⚠️ Free план

- "Засыпает" после 15 минут
- Первый запуск ~1-2 минуты
- Manual Deploy для пробуждения

## 📝 Что изменилось

✅ `frontend/src/services/api.ts` → `https://killmetraj-backend.onrender.com`
✅ `frontend/src/services/cloudSync.ts` → `https://killmetraj-backend.onrender.com`
✅ Backend готов к деплою
✅ Все зависимости на месте

**Всё готово! Задеплойте и всё заработает!** 🎉
