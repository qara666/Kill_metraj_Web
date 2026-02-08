# On-Demand Dashboard Data Fetching

## Обзор
Реализована система запроса данных за конкретную дату с автоматическим кэшированием.

## Архитектура

### Backend

#### 1. API Endpoint
**POST /api/v1/dashboard/fetch**

Запрос данных за конкретную дату. Если данных нет в кэше - запрашивает у внешнего API.

**Request Body:**
```json
{
  "date": "08.02.2026",  // Формат: DD.MM.YYYY
  "divisionId": "100000052"  // Опционально для админов
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [...],
    "couriers": [...]
  },
  "cached": false,  // true если данные из кэша
  "fetchedAt": "2026-02-08T03:00:00.000Z"
}
```

#### 2. Логика работы
1. **Проверка кэша**: Ищет данные в `api_dashboard_cache` по дате и divisionId
2. **Cache Hit**: Возвращает данные из БД
3. **Cache Miss**: 
   - Запрашивает данные у внешнего API
   - Сохраняет в БД для будущих запросов
   - Возвращает данные пользователю

#### 3. Фоновый загрузчик (DashboardFetcher V5)
- Продолжает работать в фоне
- Загружает данные для всех активных подразделений
- Автоматическая очистка старых записей (7 дней)
- Метрики производительности
- Graceful shutdown

### Frontend

#### 1. Сервис (dashboardApiService.ts)
```typescript
// Запрос данных за дату
const response = await dashboardApiService.fetchDataForDate({
  date: '08.02.2026'
});

// Конвертация форматов дат
const apiDate = dashboardApiService.convertDateToApiFormat('2026-02-08'); // -> '08.02.2026'
const jsDate = dashboardApiService.convertDateFromApiFormat('08.02.2026'); // -> '2026-02-08'
```

#### 2. Компонент (DashboardApiSection.tsx)
- Выбор даты через date picker
- Кнопка "Сегодня" для быстрого выбора
- Кнопка "Загрузить" для запроса данных
- Индикатор загрузки
- Статус: успех/ошибка
- Отображение источника данных (кэш/API)

## Использование

### Для пользователя
1. Открыть настройки → "Загрузка данных с API"
2. Выбрать дату
3. Нажать "Загрузить"
4. Дождаться загрузки данных
5. Данные автоматически загрузятся в систему

### Для разработчика

#### Добавление нового источника данных
```typescript
// В любом компоненте
import { dashboardApiService } from '../../utils/api/dashboardApiService';
import { transformDashboardData } from '../../utils/data/apiDataTransformer';
import { useExcelData } from '../../contexts/ExcelDataContext';

const { updateExcelData } = useExcelData();

const loadData = async (date: string) => {
  const response = await dashboardApiService.fetchDataForDate({ date });
  
  if (response.success && response.data) {
    const transformed = transformDashboardData(response.data, date);
    updateExcelData(transformed);
  }
};
```

## Производительность

### Кэширование
- **Первый запрос**: ~2-5 секунд (зависит от внешнего API)
- **Повторный запрос**: ~100-300мс (из БД)
- **Автоочистка**: Каждые 24 часа, удаляет данные старше 7 дней

### Оптимизации
- Batch insert для истории статусов
- Connection pooling (6 соединений)
- Экспоненциальный backoff при ошибках
- Таймауты для длинных запросов (15 сек)

## Мониторинг

### Метрики (Backend)
```javascript
const fetcher = new DashboardFetcher();
const health = await fetcher.getHealthStatus();

// Возвращает:
{
  status: 'healthy',
  database: 'connected',
  recentCacheEntries: 42,
  metrics: {
    totalFetches: 150,
    successfulFetches: 148,
    failedFetches: 2,
    totalOrders: 3500,
    totalStatusChanges: 250,
    avgResponseTime: 1200,
    cacheHits: 100,
    cacheMisses: 50
  },
  activeRequests: 2
}
```

### Логи
```
📅 On-demand fetch запрос: date=08.02.2026, divisionId=100000052, user=admin
✅ Cache hit для 08.02.2026, divisionId=100000052
💾 Данные за 08.02.2026 сохранены в кэш. Заказов: 150
```

## Конфигурация

### Environment Variables
```bash
# Backend
EXTERNAL_API_URL=http://app.yaposhka.kh.ua:4999/api/v1/dashboard
EXTERNAL_API_KEY=your_api_key
DASHBOARD_FETCH_INTERVAL=900000      # 15 минут
DASHBOARD_CONCURRENCY=3              # Параллельных потоков
CACHE_RETENTION_DAYS=7               # Хранение кэша
CLEANUP_INTERVAL=86400000            # Очистка каждые 24ч
DASHBOARD_MAX_RETRIES=5              # Макс попыток
DASHBOARD_BASE_BACKOFF=5000          # Базовая задержка

# Frontend
VITE_API_URL=http://localhost:3000
```

## Безопасность

### Авторизация
- Требуется JWT токен
- Проверка прав `dashboard:read`
- Фильтрация по divisionId для не-админов

### Валидация
- Формат даты: DD.MM.YYYY
- Обязательный divisionId
- Таймауты запросов (30 сек для пользователей, 15 сек для фона)

## Troubleshooting

### Проблема: "Внешний API не настроен"
**Решение**: Проверить переменную `EXTERNAL_API_KEY` в .env

### Проблема: "Превышено время ожидания"
**Решение**: 
1. Проверить доступность внешнего API
2. Увеличить таймаут в `dashboardApiService.ts`
3. Проверить сетевое подключение

### Проблема: Данные не обновляются
**Решение**:
1. Проверить логи фонового загрузчика
2. Очистить старый кэш вручную:
```sql
DELETE FROM api_dashboard_cache WHERE target_date = '08.02.2026';
```
3. Запросить данные заново через UI

## Будущие улучшения
- [ ] WebSocket для real-time обновлений
- [ ] Прогресс-бар для длительных загрузок
- [ ] Предзагрузка данных для соседних дат
- [ ] Экспорт метрик в Prometheus
- [ ] Retry UI для неудачных запросов
