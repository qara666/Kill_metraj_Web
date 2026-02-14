# Интеграция Умной Коррекции Адресов

## Быстрая Интеграция в RouteManagement

### Шаг 1: Добавьте импорт в начало файла

```tsx
// В файле RouteManagement.tsx добавьте:
import { SmartAddressCorrectionModal } from '../modals/SmartAddressCorrectionModal';
import { BatchAddressCorrectionPanel } from './BatchAddressCorrectionPanel';
import { useSmartAddressCorrection } from '../../hooks/useSmartAddressCorrection';
```

### Шаг 2: Добавьте state для модалок

```tsx
// В компоненте RouteManagement добавьте:
const [showCorrectionModal, setShowCorrectionModal] = useState(false);
const [showBatchPanel, setShowBatchPanel] = useState(false);
const [currentProblem, setCurrentProblem] = useState<any>(null);
const [problemOrders, setProblemOrders] = useState<any[]>([]);
```

### Шаг 3: Используйте хук

```tsx
const { validateOrders, applyCorrection, applyBatchCorrections, applyManualEdit } = useSmartAddressCorrection({
  updateExcelData,
  onCorrectionComplete: () => {
    // Пересчитать маршрут после коррекции
    setShowCorrectionModal(false);
    setShowBatchPanel(false);
  }
});
```

### Шаг 4: Замените toast.error на умную коррекцию

**Найдите строку 1257:**
```tsx
toast.error('Некоторые точки маршрута находятся вне выбранного хаба или сектора города. Проверьте адреса.')
```

**Замените на:**
```tsx
// Вместо простого toast показываем умную систему коррекции
const problems = await validateOrders(route.orders);

if (problems.length > 0) {
  setProblemOrders(problems);
  
  if (problems.length === 1) {
    // Один проблемный заказ - показываем модалку
    setCurrentProblem(problems[0]);
    setShowCorrectionModal(true);
  } else {
    // Несколько - показываем batch panel
    setShowBatchPanel(true);
  }
} else {
  toast.error('Некоторые точки маршрута находятся вне выбранного хаба или сектора города. Проверьте адреса.');
}

setIsCalculating(false);
return;
```

### Шаг 5: Добавьте модалки в JSX (перед закрывающим </div>)

```tsx
{/* Smart Address Correction Modal */}
{showCorrectionModal && currentProblem && (
  <SmartAddressCorrectionModal
    order={currentProblem.order}
    validationResult={currentProblem.validationResult}
    isDark={isDark}
    onApplyCorrection={(suggestion) => {
      applyCorrection(currentProblem.order, suggestion);
    }}
    onManualEdit={(newAddress) => {
      applyManualEdit(currentProblem.order, newAddress);
    }}
    onSkip={() => setShowCorrectionModal(false)}
    onClose={() => setShowCorrectionModal(false)}
  />
)}

{/* Batch Correction Panel */}
{showBatchPanel && problemOrders.length > 0 && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-2xl">
      <BatchAddressCorrectionPanel
        problemOrders={problemOrders}
        isDark={isDark}
        onAutoCorrectAll={(corrections) => {
          applyBatchCorrections(corrections);
        }}
        onReviewManually={() => {
          // Показываем первый заказ для ручной проверки
          setCurrentProblem(problemOrders[0]);
          setShowBatchPanel(false);
          setShowCorrectionModal(true);
        }}
        onClose={() => setShowBatchPanel(false)}
      />
    </div>
  </div>
)}
```

## Готово! 🎉

Теперь при обнаружении адресов вне зоны доставки система автоматически:
1. Проанализирует каждый проблемный адрес
2. Сгенерирует умные предложения с уверенностью
3. Покажет модалку для одного заказа или batch panel для нескольких
4. Применит коррекцию и пересчитает маршрут

## Настройка Зон Доставки

Не забудьте настроить зоны через API:

```bash
POST /api/delivery-zones
{
  "name": "Центр города",
  "polygon": [[lat1, lng1], [lat2, lng2], ...],
  "hub": { "lat": 50.45, "lng": 30.52 },
  "divisionId": "your_division"
}
```

Зоны будут автоматически загружены при старте приложения.
