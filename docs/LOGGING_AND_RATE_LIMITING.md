# Система логирования и Rate Limiting

## Backend

### Логирование (Winston)

Профессиональная система логирования на основе Winston.

**Расположение:** `backend/src/utils/logger.js`

**Особенности:**
- Разделение логов по уровням (error, warn, info, debug)
- Запись в файлы: `logs/error.log`, `logs/combined.log`
- Логирование исключений и отклоненных промисов
- Цветной вывод в консоль в режиме разработки
- Ротация логов (макс. 5MB на файл, 5 файлов)

**Использование:**
```javascript
const logger = require('./src/utils/logger');

logger.info('Информационное сообщение', { data: 'value' });
logger.warn('Предупреждение', { warning: 'details' });
logger.error('Ошибка', { error: error.message, stack: error.stack });
logger.debug('Отладочная информация', { debug: 'data' });
```

### Rate Limiting

Защита от злоупотреблений API с помощью express-rate-limit.

**Расположение:** `backend/src/middleware/rateLimiter.js`

**Лимиты:**
- **Общий лимит:** 100 запросов за 15 минут (для всех API)
- **Строгий лимит:** 20 запросов за 15 минут (для чувствительных операций)
- **Telegram API:** 10 запросов за минуту
- **Загрузка файлов:** 50 запросов за час

**Применение:**
```javascript
const { generalLimiter, telegramLimiter, uploadLimiter } = require('./src/middleware/rateLimiter');

app.use('/api/', generalLimiter);
app.use('/api/telegram', telegramLimiter);
app.post('/api/upload/excel', uploadLimiter, ...);
```

**Ответ при превышении лимита:**
```json
{
  "error": "Слишком много запросов. Попробуйте позже.",
  "retryAfter": 900
}
```

## Frontend

### Логирование

Легковесная система логирования для frontend.

**Расположение:** `frontend/src/utils/logger.ts`

**Использование:**
```typescript
import { logger } from '../utils/logger';

logger.info('Информация', { data: 'value' });
logger.warn('Предупреждение', { warning: 'details' });
logger.error('Ошибка', { error: error.message });
logger.debug('Отладка', { debug: 'data' });
```

**Особенности:**
- Логи хранятся в памяти (макс. 1000 записей)
- В production режиме выводятся только ошибки
- В development режиме выводятся все логи

### Индикаторы загрузки

#### LoadingSpinner

Улучшенный компонент спиннера загрузки.

**Расположение:** `frontend/src/components/LoadingSpinner.tsx`

**Использование:**
```tsx
import { LoadingSpinner } from '../components/LoadingSpinner';

<LoadingSpinner 
  size="md" 
  variant="primary" 
  text="Загрузка..."
  fullScreen={false}
/>
```

**Параметры:**
- `size`: 'sm' | 'md' | 'lg' | 'xl'
- `variant`: 'default' | 'primary' | 'success' | 'warning' | 'error'
- `text`: текст под спиннером
- `fullScreen`: полноэкранный режим с затемнением

#### ProgressBar

Компонент прогресс-бара.

**Расположение:** `frontend/src/components/ProgressBar.tsx`

**Использование:**
```tsx
import { ProgressBar } from '../components/ProgressBar';

<ProgressBar
  progress={50}
  total={100}
  label="Загрузка данных"
  showPercentage
  variant="gradient"
  size="md"
/>
```

**Параметры:**
- `progress`: текущее значение
- `total`: максимальное значение
- `label`: текст над прогресс-баром
- `variant`: 'default' | 'success' | 'warning' | 'error' | 'gradient'
- `size`: 'sm' | 'md' | 'lg'

#### LoadingState

Универсальный компонент состояния загрузки.

**Расположение:** `frontend/src/components/LoadingState.tsx`

**Использование:**
```tsx
import { LoadingState } from '../components/LoadingState';

<LoadingState
  isLoading={isLoading}
  progress={current}
  total={total}
  message="Обработка данных..."
  variant="progress"
  fullScreen
>
  {/* Контент после загрузки */}
</LoadingState>
```

**Варианты:**
- `spinner`: только спиннер
- `progress`: спиннер + прогресс-бар
- `skeleton`: скелетон-загрузка

## Миграция с console.log

### Backend

Заменить:
```javascript
console.log('Сообщение', data);
console.error('Ошибка', error);
```

На:
```javascript
logger.info('Сообщение', { data });
logger.error('Ошибка', { error: error.message, stack: error.stack });
```

### Frontend

Заменить:
```typescript
console.log('Сообщение', data);
console.error('Ошибка', error);
```

На:
```typescript
logger.info('Сообщение', { data });
logger.error('Ошибка', { error: error.message });
```

## Файлы логов

Логи сохраняются в `backend/logs/`:
- `error.log` - только ошибки
- `combined.log` - все логи
- `exceptions.log` - необработанные исключения
- `rejections.log` - отклоненные промисы

**Важно:** Добавьте `backend/logs/` в `.gitignore`!

