# Kill Metraj - Route Management System

Система управления маршрутами курьеров с обработкой Excel файлов и интеграцией с Google Maps.

## 🚀 Быстрый запуск

### Способ 1: Через npm команду
```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"
npm run startlocaldev
```

### Способ 2: Через скрипт
```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"
./startlocaldev.sh
```

### Способ 3: Ручной запуск
```bash
# Terminal 1 - Backend
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend"
node simple_server.js

# Terminal 2 - Frontend
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web/frontend"
npm run dev
```

## 📱 Доступ к приложению

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5001

## 🛠 Установка зависимостей

Если это первый запуск или нужно переустановить зависимости:

```bash
cd "/Users/msun/Desktop/Project apps/Kill_metraj_Web"
npm run install:all
```

## 📋 Доступные команды

- `npm run startlocaldev` - Запуск обоих серверов одновременно
- `npm run dev` - Алиас для startlocaldev
- `npm run dev:frontend` - Запуск только frontend
- `npm run dev:backend` - Запуск только backend
- `npm run build` - Сборка frontend для продакшена
- `npm run install:all` - Установка всех зависимостей

## 🔧 Структура проекта

```
Kill_metraj_Web/
├── frontend/          # React + Vite приложение
├── backend/           # Node.js + Express API
├── package.json       # Корневые скрипты
└── startlocaldev.sh   # Скрипт быстрого запуска
```

## 🐛 Решение проблем

### Сайт не открывается
1. Проверьте, что порты 5173 и 5001 свободны
2. Очистите кэш браузера
3. Перезапустите серверы

### Ошибки зависимостей
```bash
rm -rf node_modules frontend/node_modules backend/node_modules
npm run install:all
```

### Проблемы с Google Maps
- Убедитесь, что API ключ корректный в `frontend/index.html`
- Проверьте подключение к интернету

## 📞 Поддержка

При возникновении проблем проверьте логи в терминале или создайте issue в репозитории.
