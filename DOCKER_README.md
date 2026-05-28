# Docker — Kill Metraj Web

## Требования

- Docker >= 24
- Docker Compose v2

## Быстрый старт

```bash
# 1. Клонировать
git clone <repo_url> && cd Kill_metraj_Web

# 2. Настроить переменные окружения
cp backend/.env.example backend/.env
# Обязательно изменить: DB_PASSWORD, JWT_SECRET, EXTERNAL_API_KEY

# 3. Запустить
./deploy.sh start
```

## Стек

| Сервис      | Контейнер    | Порт | Описание           |
|------------|-------------|------|---------------------|
| Frontend   | km-frontend | 80   | React + Nginx       |
| Backend    | km-backend  | 5001 | Node.js API         |
| PostgreSQL | km-postgres | 5432 | База данных         |
| Redis      | km-redis    | 6379 | Кэш                 |

## Команды управления

```bash
./deploy.sh start            # Запуск всех сервисов
./deploy.sh stop             # Остановка
./deploy.sh restart backend  # Рестарт бэкенда
./deploy.sh logs backend     # Логи бэкенда
./deploy.sh status           # Статус всех контейнеров
```

## Переменные окружения (backend/.env)

См. `backend/.env.example` — все переменные с описаниями.

Критичные для продакшена:
- `JWT_SECRET` — сгенерировать длинную случайную строку
- `DB_PASSWORD` — пароль PostgreSQL
- `EXTERNAL_API_KEY` — ключ к внешнему API дашборда
- `SEED_ADMIN_PASSWORD` — пароль начального админа

## Структура

```
Kill_metraj_Web/
 docker-compose.yml          # PostgreSQL + Redis + Backend + Frontend
 deploy.sh                   # Управление развертыванием
 backend/
    Dockerfile              # Multi-stage, pnpm, non-root
    .dockerignore
    .env.example            # Шаблон переменных
 frontend/
     Dockerfile              # Vite build → Nginx
     nginx.conf              # SPA + API proxy + WebSocket
```

## Дополнительные стеки (опционально)

```bash
# OSRM + Valhalla (маршрутизация)
docker compose -f backend/docker-compose.stack.yml up -d

# Kafka + Debezium (CDC)
docker compose -f backend/docker-compose.debezium.yml up -d

# Nominatim (геокодинг)
docker compose -f backend/docker-compose.selfhost.yml up -d
```

## HTTPS / Домен

Для продакшена поставьте Nginx Proxy Manager, Traefik или Caddy перед стеком.
Certbot + Let's Encrypt для HTTPS.
