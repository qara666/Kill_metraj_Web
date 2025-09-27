# 🚀 Инструкции по деплою исправления Excel

## ✅ Что исправлено:
- **Проблема:** "0 заказов обработано" при загрузке Excel файлов
- **Причина:** Неправильный маппинг заголовка "Сумма заказа" 
- **Решение:** Исправлен алгоритм распознавания заголовков

## 📁 Измененные файлы:

### Backend:
- `backend/src/services/ExcelService.js` - **ОСНОВНОЙ ФАЙЛ** (исправлен)

### Frontend:
- `frontend/src/components/ExcelUploadSection.tsx` - новый компонент
- `frontend/src/components/ExcelResultsDisplay.tsx` - новый компонент  
- `frontend/src/components/ExcelTemplates.tsx` - новый компонент
- `frontend/src/components/ExcelDebugLogs.tsx` - новый компонент
- `frontend/src/pages/Dashboard.tsx` - обновлен

## 🚀 Пошаговый деплой:

### 1. Остановить текущие серверы:
```bash
# Остановить все Node.js процессы
pkill -f "node.*server"
pkill -f "npm.*start"
```

### 2. Обновить backend:
```bash
cd backend
# Убедиться что ExcelService.js обновлен
ls -la src/services/ExcelService.js
# Должен быть от 27 Sep 13:43

# Запустить сервер
node simple_server.js
```

### 3. Обновить frontend:
```bash
cd frontend
# Установить зависимости (если нужно)
npm install

# Запустить фронтенд
npm start
```

### 4. Проверить работу:
1. Открыть http://localhost:3000
2. Загрузить Excel файл
3. Проверить что показывает "3 заказа" вместо "0"
4. Нажать "Excel логи" для просмотра детальных логов

## 🔧 Альтернативный способ (если есть проблемы):

### Перезапуск всего:
```bash
# В корневой папке проекта
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"

# Остановить все
pkill -f "node"
pkill -f "npm"

# Запустить backend
cd backend && node simple_server.js &

# Запустить frontend  
cd ../frontend && npm start &
```

## ✅ Ожидаемый результат:
- **Заказов:** 3 (вместо 0)
- **Суммы:** 500.5, 750, 300.25 (корректно)
- **Логи:** Детальное логирование доступно
- **Дашборд:** Кнопка "Excel логи" работает

## 🆘 Если что-то не работает:

1. **Проверить порты:**
   - Backend: http://localhost:5001
   - Frontend: http://localhost:3000

2. **Проверить логи:**
   - В консоли backend должны быть логи `[DEBUG]`
   - В дашборде кнопка "Excel логи" должна показывать детали

3. **Перезапустить:**
   - Остановить все процессы
   - Запустить заново по инструкции выше

## 📞 Поддержка:
Если проблемы остаются, проверьте:
- Версию Node.js (должна быть 16+)
- Установлены ли все зависимости (`npm install`)
- Нет ли конфликтов портов
