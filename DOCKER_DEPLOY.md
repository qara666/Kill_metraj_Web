# Kill Metraj — Полное развёртывание на сервере

## 1. Перенос проекта на сервер

```bash
# На локальной машине — запаковать проект (без node_modules и .env)
cd /path/to/Kill_metraj_Web
git push                      # если есть репозиторий
# или
tar czf km.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=backend/.env \
  --exclude=frontend/node_modules \
  --exclude=backend/routing-data/ukraine-latest.osm.pbf \
  .
ssh user@server
scp km.tar.gz user@server:~/
```

## 2. На сервере

```bash
ssh user@server

# Распаковать
mkdir -p ~/Kill_metraj_Web
cd ~/Kill_metraj_Web
tar xzf ~/km.tar.gz

# Установить Docker (если нет)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Выйти и зайти снова (или newgrp docker)
```

## 3. Настроить окружение

```bash
cd ~/Kill_metraj_Web

# Создать .env из продакшн-шаблона
cp backend/.env.production backend/.env

# ОБЯЗАТЕЛЬНО отредактировать:
nano backend/.env
# - DB_PASSWORD       — надёжный пароль
# - JWT_SECRET         — сгенерировать: openssl rand -hex 32
# - SETUP_SECRET       — сгенерировать: openssl rand -hex 32
# - EXTERNAL_API_KEY   — из локального backend/.env
# - SEED_ADMIN_PASSWORD — пароль админа
```

## 4. Перенос базы данных

### На локальной машине:
```bash
cd /path/to/Kill_metraj_Web
./scripts/export_db.sh
# Файл появится в backup/kill_metraj_YYYY-MM-DD_HH-MM-SS.dump
scp backup/*.dump user@server:~/Kill_metraj_Web/backup/latest.dump
```

### На сервере (уже после запуска стека):
```bash
cd ~/Kill_metraj_Web
./scripts/import_db.sh backup/latest.dump
```

## 5. Запуск

### Базовый стек (PostgreSQL + Redis + Backend + Frontend):
```bash
./deploy.sh start
```
или напрямую:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Полный стек (+ OSRM, Valhalla, Nominatim):
```bash
docker compose -f docker-compose.prod.yml --profile routing up -d --build
```

### CDC стек (+ Kafka, Zookeeper, Debezium):
```bash
docker compose -f docker-compose.prod.yml --profile cdc up -d --build
```

### Всё сразу:
```bash
docker compose -f docker-compose.prod.yml --profile full up -d --build
```

## 6. Настройка домена и HTTPS

1. Настроить DNS: A-запись вашего домена → IP сервера
2. В `.env` указать `DOMAIN=your-domain.com`
3. Запустить стек — Caddy автоматически получит SSL-сертификат

Для проверки:
```bash
docker compose -f docker-compose.prod.yml logs caddy
```

## 7. Управление

```bash
# Статус
docker compose -f docker-compose.prod.yml ps

# Логи
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f caddy

# Рестарт сервиса
docker compose -f docker-compose.prod.yml restart backend

# Остановка всего
docker compose -f docker-compose.prod.yml down

# Обновление (пересборка)
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

## 8. Бэкап и восстановление

```bash
# Экспорт БД
./scripts/export_db.sh

# Импорт
./scripts/import_db.sh backup/filename.dump

# Резервное копирование томов Docker
docker run --rm -v km_postgres_data:/data -v $(pwd)/backup:/backup alpine \
  tar czf /backup/postgres_data_$(date +%Y%m%d).tar.gz -C /data .
```

## Структура сервисов

| Сервис | Контейнер | Внутренний порт | Внешний порт | Описание |
|--------|-----------|----------------|-------------|----------|
| Caddy | km-caddy | 80/443 | 80/443 | Reverse proxy + HTTPS |
| Frontend | km-frontend | 80 | 127.0.0.1:8080 | Nginx + React SPA |
| Backend | km-backend | 5001 | - | Express API |
| PostgreSQL | km-postgres | 5432 | 127.0.0.1:5432 | База данных |
| Redis | km-redis | 6379 | 127.0.0.1:6379 | Кэш |
| OSRM* | km-osrm | 5000 | 127.0.0.1:5050 | Маршрутизация (авто) |
| Valhalla* | km-valhalla | 8002 | 127.0.0.1:8002 | Маршрутизация (мультимод) |
| Nominatim* | km-nominatim | 8080 | 127.0.0.1:8081 | Геокодинг |
| Kafka* | km-kafka | 9092 | 127.0.0.1:9092 | CDC-события |
| Debezium* | km-debezium | 8083 | 127.0.0.1:8083 | CDC-коннектор |

* — опционально, требуют профиля `routing` / `cdc` / `full`

## Важно

- Все внешние порты (кроме 80/443) слушают только `127.0.0.1` — наружу торчит только Caddy
- Caddy автоматически проксирует HTTPS, продлевает сертификаты
- Для OSRM нужно предварительно подготовить данные (см. `backend/docker-compose.routing.yml`)
- .env с секретами НЕ попадает в git (в `.gitignore`)
