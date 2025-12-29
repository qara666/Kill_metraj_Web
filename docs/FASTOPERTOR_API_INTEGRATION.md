# Интеграция с Fastopertor API

## Описание

Добавлена возможность автоматической загрузки данных из Fastopertor API вместо ручной загрузки через drag-and-drop. Все данные приходят в формате JSON и автоматически преобразуются в формат приложения.

## Настройка

### 1. Настройки в приложении

Перейдите в **Настройки** → **Fastopertor API (автоматическая загрузка данных)**:

1. Включите опцию "Включить автоматическую загрузку данных из Fastopertor API"
2. Введите **API URL** (например: `https://api.fastopertor.com`)
3. Введите **API Key** (токен для авторизации)
4. Укажите **Endpoint** (по умолчанию: `/api/orders`)
5. Нажмите **Проверить** для валидации подключения
6. Сохраните настройки

### 2. Автоматическая загрузка

После включения опции:
- Данные автоматически загружаются при открытии вкладки Dashboard
- Данные обновляются каждые 5 минут автоматически
- Все данные объединяются с существующими (дубликаты исключаются)

### 3. Ручная загрузка

На вкладке **Dashboard** в секции загрузки файлов появится кнопка:
- **"Загрузить данные из Fastopertor API"** - для ручной загрузки данных по требованию

## API Endpoints

### Backend

- `POST /api/fastopertor/fetch` - Получить данные из Fastopertor API
- `POST /api/fastopertor/validate` - Валидация API подключения

### Формат запроса

```json
{
  "apiUrl": "https://api.fastopertor.com",
  "apiKey": "your-api-key",
  "endpoint": "/api/orders"
}
```

### Формат ответа

```json
{
  "success": true,
  "data": {
    "orders": [...],
    "couriers": [...],
    "paymentMethods": [...],
    "routes": [...],
    "errors": [],
    "warnings": []
  },
  "raw": {...},
  "message": "Данные успешно получены из Fastopertor API"
}
```

## Преобразование данных

API автоматически преобразует данные из различных форматов Fastopertor в формат приложения:

### Заказы (Orders)
- `orderNumber` / `order_id` / `id` → `orderNumber`
- `address` / `delivery_address` / `address_full` → `address`
- `phone` / `phone_number` / `contact_phone` → `phone`
- `customerName` / `customer_name` / `client_name` → `customerName`
- `amount` / `total` / `sum` → `amount`
- `plannedTime` / `planned_time` / `delivery_time` → `plannedTime`
- `readyAt` / `ready_at` / `ready_time` → `readyAt`
- `deadlineAt` / `deadline_at` / `deadline` → `deadlineAt`

### Курьеры (Couriers)
- `name` / `driver_name` / `full_name` → `name`
- `phoneNumber` / `phone` / `phone_number` → `phoneNumber`
- `vehicleType` / `vehicle_type` → `vehicleType`
- `isActive` / `active` → `isActive`

## Структура файлов

### Backend
- `backend/src/controllers/FastopertorController.js` - Контроллер для работы с API
- `backend/src/routes/fastopertorRoutes.js` - Роуты для API
- `backend/simple_server.js` - Интеграция роутов в сервер

### Frontend
- `frontend/src/services/fastopertorApi.ts` - Сервис для работы с API
- `frontend/src/pages/Settings.tsx` - Настройки Fastopertor API
- `frontend/src/pages/Dashboard.tsx` - Автоматическая загрузка данных
- `frontend/src/components/ExcelUploadSection.tsx` - Кнопка ручной загрузки
- `frontend/src/utils/localStorage.ts` - Сохранение настроек

## Использование

1. **Настройте API** в разделе Настройки
2. **Включите автоматическую загрузку** в настройках
3. Данные будут автоматически загружаться на всех вкладках:
   - Dashboard
   - Routes
   - Couriers
   - Analytics
   - AutoPlanner

## Преимущества

- ✅ Не нужно вручную выгружать данные через drag-and-drop
- ✅ Автоматическое обновление данных каждые 5 минут
- ✅ Все данные в формате JSON
- ✅ Автоматическое преобразование в формат приложения
- ✅ Валидация API подключения
- ✅ Объединение с существующими данными (без дубликатов)


