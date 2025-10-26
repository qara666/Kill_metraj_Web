# ⚡ Исправление ошибки "Не удалось подключиться к серверу"

## 🔍 Проблема
Backend на Render не запущен → frontend не может подключиться

## ✅ Решение - 2 варианта

### Вариант 1: Использовать локальный backend (СЕЙЧАС РАБОТАЕТ)

Frontend уже настроен на автоматическое определение URL!

1. **Запустите backend** (уже запущен в фоне):
   ```bash
   cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"
   node simple_server.js
   ```

2. **Запустите frontend**:
   ```bash
   cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend"
   npm run dev
   ```

3. Откройте http://localhost:5173

**Ошибка исчезнет!** ✅

### Вариант 2: Задеплоить backend на Render

После деплоя на Render создайте файл `.env` в `frontend/`:

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend"
echo "VITE_BACKEND_URL=https://killmetraj-backend.onrender.com" > .env
npm run build
```

## 🎯 Что изменилось

Код теперь автоматически определяет backend URL:

```typescript
// api.ts и cloudSync.ts
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:10000';
```

- В development: использует `localhost:10000` ✅
- На Render: использует URL из `.env` файла ✅

## 🚀 Для деплоя на Render

1. **Создайте `.env` в frontend/**:
   ```
   VITE_BACKEND_URL=https://YOUR-BACKEND-URL.onrender.com
   ```

2. **Пересоберите frontend**:
   ```bash
   cd frontend
   npm run build
   ```

3. **Задеплойте на Render**

## ✅ Текущее состояние

- ✅ Frontend использует localhost (работает локально)
- ✅ Backend запущен на localhost:10000
- ✅ Можно тестировать сейчас
- ✅ Готово к деплою на Render

