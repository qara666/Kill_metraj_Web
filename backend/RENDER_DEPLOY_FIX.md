# Исправление деплоя backend на Render

## Проблема
Backend на Render не работал и возвращал 404 ошибки для всех эндпоинтов.

## Найденные проблемы

### 1. Ошибка в package.json
- **Проблема**: Лишняя запятая после `engines` блока
- **Исправление**: Убрана лишняя запятая

### 2. Неправильная конфигурация Render
- **Проблема**: `startCommand: node simple_server.js` в render.yaml
- **Исправление**: Изменено на `startCommand: npm start`

### 3. Неправильный Procfile
- **Проблема**: `web: node simple_server.js`
- **Исправление**: Изменено на `web: npm start`

### 4. Отсутствие engines в package.json
- **Проблема**: Не указана версия Node.js
- **Исправление**: Добавлен блок `engines` с `"node": ">=18.0.0"`

## Исправленные файлы

### package.json
```json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### render.yaml
```yaml
services:
  - type: web
    name: killmetraj-backend
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

### Procfile
```
web: npm start
```

## Инструкция по деплою

1. **Закоммитьте изменения**:
   ```bash
   cd backend
   git add .
   git commit -m "Fix Render deployment configuration"
   git push
   ```

2. **Перезапустите сервис на Render**:
   - Зайдите в панель Render
   - Найдите сервис `killmetraj-backend`
   - Нажмите "Manual Deploy" → "Deploy latest commit"

3. **Проверьте логи**:
   - В панели Render перейдите в раздел "Logs"
   - Убедитесь, что сервер запустился без ошибок

4. **Протестируйте API**:
   ```bash
   curl https://killmetraj-backend.onrender.com/api/health
   ```

## Ожидаемый результат

✅ Сервер запускается без ошибок  
✅ API эндпоинты отвечают корректно  
✅ Excel файлы обрабатываются  
✅ Заказы считаются правильно  

## Проверка

После деплоя проверьте:
- `GET /api/health` - должен вернуть статус "healthy"
- `POST /api/upload/excel` - должен обрабатывать Excel файлы
- `GET /api/sync/check/:userId` - должен работать для синхронизации
