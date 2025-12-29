# Структура проекта

## Общая структура

```
Kill_metraj_Web/
├── backend/              # Backend приложение (Node.js/Express)
├── frontend/             # Frontend приложение (React/TypeScript)
├── docs/                 # Документация проекта
├── scripts/              # Скрипты для запуска и утилиты
├── config/               # Конфигурационные файлы
├── temp/                 # Временные файлы
└── test-data/           # Тестовые данные
```

## Backend структура

```
backend/
├── src/
│   ├── controllers/      # Контроллеры API
│   │   ├── FastopertorController.js
│   │   └── UploadController.js
│   ├── middleware/       # Middleware (rate limiting, auth и т.д.)
│   │   └── rateLimiter.js
│   ├── models/           # Модели данных
│   │   ├── Courier.js
│   │   ├── Order.js
│   │   ├── PaymentMethod.js
│   │   └── Route.js
│   ├── routes/           # Маршруты API
│   │   ├── fastopertorRoutes.js
│   │   ├── telegramRoutes.js
│   │   └── uploadRoutes.js
│   ├── services/         # Бизнес-логика
│   │   ├── ExcelService_v3.js
│   │   ├── GoogleMapsService.js
│   │   └── TelegramService.js
│   └── utils/            # Утилиты
│       └── logger.js
├── logs/                 # Логи приложения
├── sessions/             # Сессии Telegram
├── simple_server.js      # Точка входа сервера
└── package.json
```

## Frontend структура

```
frontend/
├── src/
│   ├── components/       # React компоненты
│   │   ├── shared/       # Общие компоненты
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── StatsCard.tsx
│   │   │   └── Layout.tsx
│   │   ├── modals/       # Модальные окна
│   │   │   ├── AddressEditModal.tsx
│   │   │   ├── HelpModal.tsx
│   │   │   ├── HelpModalCouriers.tsx
│   │   │   ├── HelpModalRoutes.tsx
│   │   │   ├── ApiKeyNotification.tsx
│   │   │   └── ApiKeyStatus.tsx
│   │   ├── maps/         # Компоненты карт
│   │   │   ├── RouteMap.tsx
│   │   │   ├── SimpleRouteMap.tsx
│   │   │   ├── TrafficHeatmap.tsx
│   │   │   └── WorkloadHeatmap.tsx
│   │   ├── excel/        # Компоненты для работы с Excel
│   │   │   ├── ExcelUploadSection.tsx
│   │   │   ├── ExcelDataPreview.tsx
│   │   │   ├── ExcelDebugLogs.tsx
│   │   │   ├── ExcelResultsDisplay.tsx
│   │   │   └── FileUpload.tsx
│   │   ├── route/        # Компоненты маршрутов
│   │   │   ├── RoutePlanner.tsx
│   │   │   ├── RouteManagement.tsx
│   │   │   └── RouteDetailsTabs.tsx
│   │   ├── courier/      # Компоненты курьеров
│   │   │   ├── CourierManagement.tsx
│   │   │   └── CourierCard.tsx
│   │   ├── analytics/   # Компоненты аналитики
│   │   │   └── AnalyticsDashboard.tsx
│   │   ├── zone/         # Компоненты зон
│   │   │   ├── ZoneDetails.tsx
│   │   │   ├── ZoneStats.tsx
│   │   │   └── CitySectorsEditor.tsx
│   │   └── features/     # Функциональные компоненты
│   │       ├── DataSharing.tsx
│   │       ├── DataSharingDemo.tsx
│   │       ├── SyncStatus.tsx
│   │       └── HelpTour.tsx
│   ├── pages/            # Страницы приложения
│   │   ├── Dashboard.tsx
│   │   ├── AutoPlanner.tsx
│   │   ├── Routes.tsx
│   │   ├── Couriers.tsx
│   │   ├── Analytics.tsx
│   │   ├── Settings.tsx
│   │   ├── TelegramParsing.tsx
│   │   └── Zones.tsx
│   ├── services/         # Сервисы для работы с API
│   │   ├── api.ts
│   │   ├── fastopertorApi.ts
│   │   ├── telegramService.ts
│   │   ├── geocodingService.ts
│   │   ├── addressValidation.ts
│   │   └── cloudSync.ts
│   ├── utils/            # Утилиты
│   │   ├── api/          # Утилиты для работы с API
│   │   │   ├── apiKeyValidator.ts
│   │   │   ├── googleAPIManager.ts
│   │   │   └── googleApiCache.ts
│   │   ├── maps/         # Утилиты для карт
│   │   │   ├── googleMapsLoader.ts
│   │   │   ├── mapboxLoader.ts
│   │   │   ├── mapboxTrafficAPI.ts
│   │   │   └── ukraineTrafficAPI.ts
│   │   ├── routes/       # Утилиты для маршрутов
│   │   │   ├── routeOptimization.ts
│   │   │   ├── advancedRouteOptimization.ts
│   │   │   ├── trafficAwareOptimization.ts
│   │   │   ├── routeOptimizationHelpers.ts
│   │   │   ├── routeOptimizationCache.ts
│   │   │   ├── routeAnalytics.ts
│   │   │   ├── routeEfficiency.ts
│   │   │   ├── routeExport.ts
│   │   │   ├── routeHistory.ts
│   │   │   └── courierSchedule.ts
│   │   ├── data/         # Утилиты для работы с данными
│   │   │   ├── excelProcessor.ts
│   │   │   ├── htmlProcessor.ts
│   │   │   ├── dataSharing.ts
│   │   │   └── paymentMethodHelper.ts
│   │   ├── processing/  # Утилиты обработки
│   │   │   └── coverageAnalysis.ts
│   │   └── ui/           # UI утилиты
│   │       ├── logger.ts
│   │       ├── notifications.ts
│   │       └── localStorage.ts
│   ├── contexts/         # React контексты
│   │   ├── ExcelDataContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/            # React хуки
│   │   ├── useApiKey.ts
│   │   ├── useCloudSync.ts
│   │   └── useDataSync.ts
│   ├── types/            # TypeScript типы
│   │   └── index.ts
│   ├── styles/           # Стили
│   │   └── themes.css
│   └── tests/            # Тесты
│       └── example.test.ts
├── public/               # Статические файлы
└── package.json
```

## Документация

```
docs/
├── AUTOPLANNER_IMPROVEMENTS.md
├── FASTOPERTOR_API_INTEGRATION.md
├── LOGGING_AND_RATE_LIMITING.md
├── PROJECT_STRUCTURE.md
└── TELEGRAM_INTEGRATION.md
```

## Скрипты

```
scripts/
├── check_servers.sh
├── start_frontend.sh
├── start_local.sh
├── start-cloud-sync.sh
├── startlocaldev_enhanced.sh
├── StartLocalDev.command
├── startlocaldev.sh
└── fix-imports.sh         # Скрипт для обновления импортов
```

## Принципы организации

### Компоненты
- **shared/** - Переиспользуемые компоненты (LoadingSpinner, Tooltip и т.д.)
- **modals/** - Модальные окна
- **maps/** - Компоненты для работы с картами
- **excel/** - Компоненты для работы с Excel
- **route/** - Компоненты маршрутов
- **courier/** - Компоненты курьеров
- **analytics/** - Компоненты аналитики
- **zone/** - Компоненты зон
- **features/** - Функциональные компоненты

### Утилиты
- **api/** - Утилиты для работы с API
- **maps/** - Утилиты для карт
- **routes/** - Утилиты для маршрутов
- **data/** - Утилиты для работы с данными
- **processing/** - Утилиты обработки
- **ui/** - UI утилиты

### Импорты

Примеры правильных импортов:

```typescript
// Компоненты
import { LoadingSpinner } from '../components/shared/LoadingSpinner'
import { RouteMap } from '../components/maps/RouteMap'
import { ExcelUploadSection } from '../components/excel/ExcelUploadSection'

// Утилиты
import { localStorageUtils } from '../utils/ui/localStorage'
import { routeOptimization } from '../utils/routes/routeOptimization'
import { googleMapsLoader } from '../utils/maps/googleMapsLoader'
import { excelProcessor } from '../utils/data/excelProcessor'
```

## Миграция

Если нужно обновить импорты после реорганизации, используйте скрипт:

```bash
bash scripts/fix-imports.sh
```

