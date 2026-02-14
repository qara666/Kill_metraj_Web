# Smart Address Correction System - Usage Guide

## Quick Start

### 1. Настройка Зон Доставки (Backend)

Создайте зоны доставки через API:

```bash
POST /api/delivery-zones
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Центр Киева",
  "polygon": [
    [50.4501, 30.5234],
    [50.4601, 30.5334],
    [50.4501, 30.5434],
    [50.4401, 30.5334]
  ],
  "hub": {
    "lat": 50.4501,
    "lng": 30.5234
  },
  "divisionId": "kyiv_division"
}
```

### 2. Интеграция в RouteManagement (Frontend)

```tsx
import { getAddressZoneValidator } from '../services/addressZoneValidator';
import { SmartAddressCorrectionModal } from '../components/modals/SmartAddressCorrectionModal';
import { BatchAddressCorrectionPanel } from '../components/route/BatchAddressCorrectionPanel';

// В компоненте RouteManagement
const [showCorrectionModal, setShowCorrectionModal] = useState(false);
const [currentProblemOrder, setCurrentProblemOrder] = useState(null);
const [validationResult, setValidationResult] = useState(null);

// Загрузка зон при монтировании
useEffect(() => {
  const loadDeliveryZones = async () => {
    const response = await fetch('/api/delivery-zones/kyiv_division', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    
    const validator = getAddressZoneValidator();
    validator.setZones(data.zones);
  };
  
  loadDeliveryZones();
}, []);

// Валидация при загрузке заказов
const validateOrders = async (orders) => {
  const validator = getAddressZoneValidator();
  const problemOrders = [];
  
  for (const order of orders) {
    if (order.coords) {
      const result = await validator.validateAddress(
        order.address,
        order.coords,
        order
      );
      
      if (!result.isValid) {
        problemOrders.push({ order, validationResult: result });
      }
    }
  }
  
  if (problemOrders.length > 0) {
    // Показываем batch panel
    setShowBatchPanel(true);
    setProblemOrders(problemOrders);
  }
};

// Применение коррекции
const handleApplyCorrection = (suggestion) => {
  // Обновляем адрес заказа
  updateOrder(currentProblemOrder.id, {
    address: suggestion.address,
    coords: suggestion.coords,
    correctedBy: 'smart_system',
    correctionConfidence: suggestion.confidence
  });
  
  setShowCorrectionModal(false);
};
```

### 3. Batch Processing

```tsx
<BatchAddressCorrectionPanel
  problemOrders={problemOrders}
  isDark={isDark}
  onAutoCorrectAll={(corrections) => {
    // Применяем все коррекции
    corrections.forEach((suggestion, orderId) => {
      updateOrder(orderId, {
        address: suggestion.address,
        coords: suggestion.coords
      });
    });
  }}
  onReviewManually={() => {
    // Показываем модалку для каждого заказа
    setProblemOrders(lowConfidenceOrders);
  }}
  onClose={() => setShowBatchPanel(false)}
/>
```

## API Endpoints

### GET /api/delivery-zones/:divisionId
Получить все зоны доставки

### POST /api/delivery-zones
Создать новую зону

### PUT /api/delivery-zones/:zoneId
Обновить зону

### DELETE /api/delivery-zones/:zoneId
Удалить зону

### POST /api/delivery-zones/validate
Валидировать координаты

## Настройки

```tsx
const validator = getAddressZoneValidator();

// Установить порог уверенности для авто-коррекции
validator.setConfidenceThreshold(90); // 0-100

// Проверить, можно ли применить автоматически
if (validator.canAutoCorrect(suggestion)) {
  // Применяем без подтверждения
}
```

## Расширение

### Добавление Google Places API

В `addressZoneValidator.ts` раскомментируйте и реализуйте:

```typescript
private async findSimilarAddresses(
  address: string,
  coords: Coordinates
): Promise<AddressSuggestion[]> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
    `location=${coords.lat},${coords.lng}&radius=500&keyword=${encodeURIComponent(address)}&key=${API_KEY}`
  );
  
  const data = await response.json();
  // Обработка результатов...
}
```

### Исторические Данные

Реализуйте эндпоинт:

```javascript
// backend/src/routes/customerRoutes.js
router.get('/customers/:phone/addresses', async (req, res) => {
  const { phone } = req.params;
  
  const orders = await Order.find({ phone })
    .select('address coords')
    .limit(10);
    
  res.json({ addresses: orders });
});
```

## Troubleshooting

**Проблема:** Зоны не загружаются  
**Решение:** Проверьте, что маршрут зарегистрирован в `server.js` и MongoDB подключена

**Проблема:** Все адреса считаются невалидными  
**Решение:** Убедитесь, что полигоны зон корректны (минимум 3 точки, формат [lat, lng])

**Проблема:** Низкая уверенность предложений  
**Решение:** Добавьте больше зон или реализуйте Google Places API для лучших предложений
