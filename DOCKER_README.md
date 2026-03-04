# 🐳 DOCKER README — Kill Metraj Web

## Предварительные требования

На сервере должны быть установлены:
- [Docker](https://docs.docker.com/engine/install/) >= 24
- [Docker Compose](https://docs.docker.com/compose/install/) >= v2

---

## Запуск на сервере

### 1. Скопируй проект на сервер

```bash
git clone <repo_url> Kill_metraj_Web
cd Kill_metraj_Web
```

### 2. Создай файл переменных окружения

```bash
cp backend/.env.example backend/.env
# Заполни все значения в backend/.env:
# DATABASE_URL, JWT_SECRET, EXTERNAL_API_KEY, REDIS_URL и т.д.
```

### 3. Запусти

```bash
docker compose up --build -d
```

- **Frontend** доступен на `http://<IP_СЕРВЕРА>:80`
- **Backend API** доступен на `http://<IP_СЕРВЕРА>:5001`

---

## Полезные команды

| Команда | Действие |
|---|---|
| `docker compose up --build -d` | Первый запуск / пересборка |
| `docker compose up -d` | Запуск без пересборки |
| `docker compose down` | Остановить |
| `docker compose logs -f backend` | Логи бэкенда |
| `docker compose logs -f frontend` | Логи фронтенда |
| `docker compose ps` | Статус контейнеров |
| `docker compose restart backend` | Рестарт бэкенда |

---

## Структура Docker-файлов

```
Kill_metraj_Web/
├── docker-compose.yml        ← Главный файл запуска
├── backend/
│   ├── Dockerfile            ← Node.js 22 Alpine
│   └── .dockerignore
└── frontend/
    ├── Dockerfile            ← Build (Vite) → Serve (Nginx)
    ├── nginx.conf            ← SPA routing + API proxy
    └── .dockerignore
```

---

## Настройка домена (опционально)

Если у тебя есть домен, поставь **Nginx** или **Traefik** как reverse proxy снаружи и проксируй на порт `80`.

Для HTTPS используй [Certbot](https://certbot.eff.org/).
