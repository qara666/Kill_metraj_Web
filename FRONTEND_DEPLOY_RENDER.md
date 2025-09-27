# 🚀 РАЗВЕРТЫВАНИЕ ФРОНТЕНДА НА RENDER

## 📋 Обзор

Это руководство поможет вам развернуть React фронтенд приложения Kill_metraj на платформе Render.

## 🔧 Подготовка

### 1. Структура проекта
```
Kill_metraj_Web/
├── frontend/                 # React приложение
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
└── backend/                  # Node.js API
    └── ...
```

### 2. Требования
- GitHub репозиторий с кодом
- Аккаунт на [Render.com](https://render.com)
- Настроенный backend API

## 🚀 Пошаговое развертывание

### Шаг 1: Подготовка фронтенда

#### 1.1 Проверьте package.json
Убедитесь, что в `frontend/package.json` есть:
```json
{
  "name": "kill-metraj-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.15.0",
    "axios": "^1.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "vite": "^4.4.5"
  }
}
```

#### 1.2 Настройте переменные окружения
Создайте файл `frontend/.env.production`:
```env
VITE_API_URL=https://your-backend-url.onrender.com
VITE_APP_NAME=Kill Metraj
VITE_APP_VERSION=1.0.0
```

#### 1.3 Обновите API URL в коде
В файле `frontend/src/services/api.ts`:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

### Шаг 2: Создание Static Site на Render

#### 2.1 Войдите в Render Dashboard
1. Перейдите на [render.com](https://render.com)
2. Войдите в свой аккаунт
3. Нажмите **"New +"** → **"Static Site"**

#### 2.2 Подключите репозиторий
1. Выберите **"Build and deploy from a Git repository"**
2. Подключите ваш GitHub репозиторий
3. Выберите репозиторий с проектом

#### 2.3 Настройте конфигурацию
```
Name: kill-metraj-frontend
Branch: main (или ваша основная ветка)
Root Directory: frontend
Build Command: npm install && npm run build
Publish Directory: dist
```

### Шаг 3: Настройка переменных окружения

В разделе **Environment Variables** добавьте:
```
VITE_API_URL=https://your-backend-url.onrender.com
VITE_APP_NAME=Kill Metraj
VITE_APP_VERSION=1.0.0
```

### Шаг 4: Настройка CORS

Убедитесь, что в backend настроен CORS для вашего фронтенда:
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://kill-metraj-frontend.onrender.com',
  credentials: true
}));
```

## 🔧 Дополнительные настройки

### 1. Настройка Vite для продакшена

Создайте `frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          utils: ['axios']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  },
  preview: {
    port: 3000,
    host: true
  }
})
```

### 2. Настройка для SPA (Single Page Application)

Создайте `frontend/public/_redirects`:
```
/*    /index.html   200
```

### 3. Оптимизация сборки

Обновите `frontend/package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "build:analyze": "vite build --mode analyze"
  }
}
```

## 🚀 Процесс развертывания

### 1. Автоматическое развертывание
После настройки Render будет:
1. Клонировать ваш репозиторий
2. Устанавливать зависимости (`npm install`)
3. Собирать проект (`npm run build`)
4. Развертывать статические файлы

### 2. Ручное развертывание
Если нужно развернуть вручную:
1. Нажмите **"Manual Deploy"** в Render Dashboard
2. Выберите ветку для развертывания
3. Дождитесь завершения сборки

## 🔍 Проверка развертывания

### 1. Проверьте статус
- В Render Dashboard должен быть статус **"Live"**
- URL должен быть доступен

### 2. Проверьте функциональность
- Откройте сайт в браузере
- Проверьте подключение к API
- Протестируйте основные функции

### 3. Проверьте логи
- В Render Dashboard перейдите в **"Logs"**
- Убедитесь, что нет ошибок сборки

## 🆘 Устранение неполадок

### Ошибка: Build failed
**Причины:**
- Неправильные зависимости в package.json
- Ошибки в коде
- Неправильная конфигурация Vite

**Решение:**
1. Проверьте логи сборки
2. Исправьте ошибки в коде
3. Обновите зависимости

### Ошибка: 404 на роутах
**Причина:** SPA не настроена правильно

**Решение:**
1. Создайте файл `public/_redirects`
2. Добавьте правило: `/*    /index.html   200`

### Ошибка: API не подключается
**Причина:** Неправильный URL API

**Решение:**
1. Проверьте переменную `VITE_API_URL`
2. Убедитесь, что backend доступен
3. Проверьте настройки CORS

## 📊 Мониторинг и аналитика

### 1. Логи приложения
- Render предоставляет логи в реальном времени
- Мониторьте ошибки и предупреждения

### 2. Производительность
- Используйте инструменты разработчика браузера
- Проверьте время загрузки
- Оптимизируйте изображения и ресурсы

### 3. Обновления
- Render автоматически развертывает изменения из Git
- Используйте feature branches для тестирования

## 🔄 Обновление приложения

### 1. Автоматическое обновление
1. Внесите изменения в код
2. Зафиксируйте изменения в Git
3. Запушьте в основную ветку
4. Render автоматически развернет обновления

### 2. Откат изменений
1. В Render Dashboard перейдите в **"Deploys"**
2. Выберите предыдущую версию
3. Нажмите **"Rollback"**

## 📋 Чек-лист развертывания

- [ ] GitHub репозиторий настроен
- [ ] Frontend код готов
- [ ] package.json настроен
- [ ] Переменные окружения настроены
- [ ] Backend API доступен
- [ ] CORS настроен
- [ ] Static Site создан в Render
- [ ] Домен настроен (опционально)
- [ ] SSL сертификат активен
- [ ] Приложение протестировано

## 🌐 Дополнительные возможности

### 1. Кастомный домен
1. В Render Dashboard перейдите в настройки сайта
2. Добавьте ваш домен
3. Настройте DNS записи

### 2. CDN
Render автоматически использует CDN для статических файлов

### 3. SSL
SSL сертификат предоставляется автоматически

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте [документацию Render](https://render.com/docs)
2. Обратитесь в [поддержку Render](https://render.com/support)
3. Проверьте логи приложения

---

**Фронтенд готов к развертыванию на Render! 🎉**
