# Настройка для Render

## Backend (Node.js)

### Переменные окружения на Render:
```
PORT=10000
NODE_ENV=production
CORS_ORIGIN=https://kill-metraj-frontend.onrender.com
```

### Команда запуска:
```
npm start
```

### URL бэкенда:
```
https://kill-metraj-backend.onrender.com
```

## Frontend (Vite)

### Переменные окружения на Render:
```
VITE_API_URL=https://kill-metraj-backend.onrender.com
```

### Команда сборки:
```
npm run build
```

### Команда запуска:
```
npm run preview
```

### Директория для статики:
```
dist
```

## Проблемы и решения

### 1. CORS ошибки
- Убедитесь, что в `simple_server.js` добавлен URL фронтенда в `cors.origin`
- На бэкенде должно быть: `origin: ['https://kill-metraj-frontend.onrender.com']`

### 2. API недоступен
- Проверьте переменную окружения `VITE_API_URL` на фронтенде
- Проверьте, что бэкенд запущен и доступен
- Проверьте логи бэкенда на Render

### 3. Excel файлы не обрабатываются
- Файлы теперь обрабатываются на бэкенде через `ExcelService_v3.js`
- Проверьте логи бэкенда для ошибок обработки
- Убедитесь, что `xlsx` установлен на бэкенде

### 4. Подключение не работает
- Убедитесь, что оба сервиса запущены на Render
- Проверьте, что порты настроены правильно
- Используйте HTTPS URLs для подключения
