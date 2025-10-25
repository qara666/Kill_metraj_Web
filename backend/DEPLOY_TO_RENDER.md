# Развертывание Backend на Render

## Шаги для развертывания:

1. **Создайте новый Web Service на Render:**
   - Перейдите на https://render.com
   - Нажмите "New" → "Web Service"
   - Подключите ваш GitHub репозиторий

2. **Настройки сервиса:**
   - **Name:** `killmetraj-backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

3. **Переменные окружения:**
   - `NODE_ENV=production`
   - `PORT=10000`

4. **После развертывания:**
   - URL будет: `https://killmetraj-backend.onrender.com`
   - Проверьте: `https://killmetraj-backend.onrender.com/api/health`

## Эндпоинты облачной синхронизации:

- `POST /sync/save` - Сохранить данные
- `GET /sync/get/:userId` - Получить данные пользователя
- `GET /sync/check/:userId` - Проверить обновления
- `POST /sync/share` - Создать ссылку для sharing
- `GET /sync/import/:shareId` - Импортировать данные по ссылке

## Тестирование:

```bash
# Проверка здоровья сервера
curl https://killmetraj-backend.onrender.com/api/health

# Тест облачной синхронизации
curl -X POST https://killmetraj-backend.onrender.com/sync/save \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "data": {"test": "data"}, "timestamp": 1234567890}'
```
