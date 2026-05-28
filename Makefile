# ═══════════════════════════════════════════════════════════════
# Kill Metraj — Makefile для деплоя
# ═══════════════════════════════════════════════════════════════
.PHONY: help start stop restart logs status build pull export import setup

COMPOSE_PROD = docker compose -f docker-compose.prod.yml

help:
	@echo ""
	@echo "  Kill Metraj — Docker Commands"
	@echo "  ─────────────────────────────────────────────"
	@echo "  make setup      — Первый запуск: инициализация .env"
	@echo "  make start      — Запустить всё (prod)"
	@echo "  make stop       — Остановить"
	@echo "  make restart    — Перезапустить backend"
	@echo "  make build      — Пересобрать образы"
	@echo "  make logs       — Логи backend"
	@echo "  make logs s=frontend — Логи frontend"
	@echo "  make status     — Статус контейнеров"
	@echo "  make pull       — Обновить из git и перезапустить"
	@echo "  make export     — Экспорт БД в backup/"
	@echo "  make import f=backup/file.dump — Импорт БД"
	@echo ""

setup:
	@if [ ! -f backend/.env ]; then \
		cp .env.server.example backend/.env; \
		echo ""; \
		echo "  ✅  backend/.env создан из шаблона"; \
		echo "  ⚠️   ЗАПОЛНИ backend/.env перед запуском:"; \
		echo "       - DB_PASSWORD"; \
		echo "       - JWT_SECRET (openssl rand -hex 32)"; \
		echo "       - SEED_ADMIN_PASSWORD"; \
		echo "       - DOMAIN (IP или домен сервера)"; \
		echo "       - EXTERNAL_API_KEY"; \
		echo ""; \
		echo "  Потом запусти: make start"; \
	else \
		echo "  backend/.env уже существует"; \
	fi

start:
	./deploy.sh start:prod

stop:
	$(COMPOSE_PROD) down

restart:
	$(COMPOSE_PROD) restart $(or $(s),backend)

build:
	$(COMPOSE_PROD) up --build -d

logs:
	$(COMPOSE_PROD) logs -f --tail=100 $(or $(s),backend)

status:
	$(COMPOSE_PROD) ps

pull:
	git pull
	$(COMPOSE_PROD) up --build -d backend frontend
	$(COMPOSE_PROD) ps

export:
	./scripts/export_db.sh

import:
	./scripts/import_db.sh $(f)

clean:
	$(COMPOSE_PROD) down -v --remove-orphans
	@echo "⚠️  Все данные удалены (volumes тоже)"
