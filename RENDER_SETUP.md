# Настройка Render для связи бэкенда и фронтенда

## Проблема
Фронтенд не может подключиться к бэкенду на Render, потому что они развернуты как отдельные сервисы.

## Решение

### 1. Настройка бэкенда на Render

#### Создание Web Service для бэкенда:
1. Подключите репозиторий GitHub
2. Выберите папку `backend`
3. Настройки:
   - **Build Command**: `npm install`
   - **Start Command**: `node simple_server.js`
   - **Environment**: `Node`

#### Переменные окружения для бэкенда:
```
NODE_ENV=production
PORT=5001
```

### 2. Настройка фронтенда на Render

#### Создание Static Site для фронтенда:
1. Подключите тот же репозиторий GitHub
2. Выберите папку `frontend`
3. Настройки:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`

#### Переменные окружения для фронтенда:
```
VITE_API_BASE_URL=https://your-backend-service.onrender.com/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 3. Обновление CORS в бэкенде

После получения URL фронтенда, обновите `backend/simple_server.js`:

```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-frontend-service.onrender.com', // Замените на ваш URL
  ],
  credentials: true
}));
```

### 4. Проверка работы

1. **Бэкенд**: Откройте `https://your-backend-service.onrender.com/api/health`
2. **Фронтенд**: Откройте `https://your-frontend-service.onrender.com`
3. **Проверка связи**: Загрузите Excel файл во фронтенде

### 5. Отладка

Если не работает:

1. **Проверьте URL бэкенда** в переменных окружения фронтенда
2. **Проверьте CORS** - добавьте URL фронтенда в список разрешенных
3. **Проверьте логи** в Render Dashboard
4. **Проверьте Network** в DevTools браузера

### 6. Примеры URL

- **Бэкенд**: `https://kill-metraj-backend.onrender.com`
- **Фронтенд**: `https://kill-metraj-frontend.onrender.com`
- **API Base URL**: `https://kill-metraj-backend.onrender.com/api`

## Важно!

1. **Замените** `your-backend-service.onrender.com` на реальный URL вашего бэкенда
2. **Замените** `your-frontend-service.onrender.com` на реальный URL вашего фронтенда
3. **Обновите** CORS настройки после получения URL
4. **Перезапустите** сервисы после изменения переменных окружения
