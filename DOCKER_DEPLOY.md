# ═══════════════════════════════════════════════════════════════
# Kill Metraj — Деплой на сервер через Docker
# ═══════════════════════════════════════════════════════════════

# 🚀 Быстрый старт (если Docker уже установлен)

## Шаг 1: Скопируй проект на сервер

```bash
# Вариант А: через git
git clone git@github.com:YOUR_ORG/Kill_metraj_Web.git ~/kill_metraj
cd ~/kill_metraj

# Вариант Б: через scp (с локальной машины)
scp -r /Users/msun/Documents/GitHub/Kill_metraj_Web user@SERVER_IP:~/kill_metraj
```

## Шаг 2: Настрой переменные окружения

```bash
cd ~/kill_metraj
make setup          # создаст backend/.env из шаблона
nano backend/.env   # заполни значения
```

**Обязательно заполни:**
| Переменная | Что поставить |
|---|---|
| `DB_PASSWORD` | Любой сложный пароль |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `SEED_ADMIN_PASSWORD` | Пароль для входа в систему |
| `DOMAIN` | IP сервера или домен (например `192.168.1.100`) |
| `EXTERNAL_API_KEY` | Ключ от Yaposhka API |

## Шаг 3: Запусти

```bash
make start
```

Готово! Проект доступен по адресу: `http://YOUR_SERVER_IP`

---

# 📦 Перенести данные с локальной машины

## Экспорт с локального Mac

```bash
# На локальном Mac (в папке проекта):
./scripts/export_db.sh

# Покажет что-то вроде:
# ✓ Экспорт завершён: backup/yapiko_auto_km_2026-05-28_14-30-00.sql.dump
# Размер: 45M
```

## Копирование дампа на сервер

```bash
scp backup/yapiko_auto_km_*.dump user@SERVER_IP:~/kill_metraj/backup/
```

## Импорт на сервере

```bash
# На сервере:
cd ~/kill_metraj
make import f=backup/yapiko_auto_km_2026-05-28_14-30-00.sql.dump
```

---

# 🐳 Что запускается в Docker

| Контейнер | Описание | Порт |
|---|---|---|
| `km-caddy` | Reverse proxy, авто-HTTPS | 80, 443 |
| `km-backend` | Node.js API | внутренний 5001 |
| `km-frontend` | Nginx + React SPA | внутренний 80 |
| `km-postgres` | PostgreSQL 16 | внутренний 5432 |
| `km-redis` | Redis 7 | внутренний 6379 |

---

# 🔧 Управление сервером

```bash
make status          # статус всех контейнеров
make logs            # логи backend
make logs s=frontend # логи frontend
make logs s=postgres # логи базы данных
make restart         # перезапустить backend
make stop            # остановить всё
make start           # запустить снова
```

## Обновление после изменений в коде

```bash
cd ~/kill_metraj
git pull             # получить новый код
make build           # пересобрать и перезапустить
```

---

# 🖥️ Первый раз на чистом сервере (Ubuntu/Debian)

Если Docker ещё не установлен:

```bash
# Скопируй скрипт установки на сервер и запусти:
scp scripts/server_setup.sh user@SERVER_IP:~/
ssh user@SERVER_IP "sudo bash server_setup.sh"
```

Скрипт автоматически:
- Установит Docker и Docker Compose
- Настроит firewall (порты 22, 80, 443)
- Добавит пользователя в группу docker

---

# 🔒 HTTPS с доменом (опционально)

Если у тебя есть домен (например `km.your-company.com`):

1. Укажи домен в `backend/.env`:
   ```
   DOMAIN=km.your-company.com
   FRONTEND_URL=https://km.your-company.com
   ```

2. Направь DNS A-запись домена на IP сервера

3. Запусти — Caddy сам получит SSL сертификат от Let's Encrypt

---

# 🚨 Частые проблемы

### Backend не стартует
```bash
make logs s=backend  # смотри ошибки
```
Скорее всего: неправильный `DB_PASSWORD` или `EXTERNAL_API_KEY`

### Нет доступа к сайту
```bash
make status          # все ли контейнеры Up?
# Проверь firewall: порты 80 и 443 открыты?
```

### Сбросить всё и начать заново
```bash
make clean           # ⚠️ УДАЛИТ ВСЕ ДАННЫЕ
make start
```

### Посмотреть все контейнеры
```bash
docker ps -a
docker compose -f docker-compose.prod.yml ps
```
