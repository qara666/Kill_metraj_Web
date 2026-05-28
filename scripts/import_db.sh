#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Kill Metraj — Import DB dump into running Docker container
# ═══════════════════════════════════════════════════════════════
# Использование:
#   ./scripts/import_db.sh backup/my_dump.dump
#   make import f=backup/my_dump.dump
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Загружаем переменные
if [ -f backend/.env ]; then
    set -a; source backend/.env; set +a
fi

DB_NAME="${DB_NAME:-kill_metraj}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

DUMP_FILE="${1:-}"

if [ -z "$DUMP_FILE" ]; then
    error "Укажи файл дампа!\n  Использование: $0 backup/file.dump\n  или: make import f=backup/file.dump"
fi

if [ ! -f "$DUMP_FILE" ]; then
    error "Файл не найден: $DUMP_FILE"
fi

info "Импорт: $DUMP_FILE → БД: $DB_NAME"

# Определяем — запущен ли Docker контейнер postgres
POSTGRES_CONTAINER="km-postgres"

if docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
    info "Найден Docker контейнер $POSTGRES_CONTAINER — импортирую внутрь него"

    # Копируем дамп в контейнер
    docker cp "$DUMP_FILE" "${POSTGRES_CONTAINER}:/tmp/import.dump"

    # Восстанавливаем
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
        pg_restore \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --no-owner --no-acl \
            --clean --if-exists \
            --verbose \
            /tmp/import.dump \
        && info "Импорт завершён!" \
        || warn "pg_restore вернул ненулевой код (обычно это нормально для --clean)"

    # Удаляем временный файл
    docker exec "$POSTGRES_CONTAINER" rm -f /tmp/import.dump

else
    warn "Docker контейнер $POSTGRES_CONTAINER не запущен. Пробую локальный PostgreSQL..."

    if ! command -v pg_restore &>/dev/null; then
        error "pg_restore не найден. Установи PostgreSQL клиент или запусти контейнеры: make start"
    fi

    export PGPASSWORD="$DB_PASSWORD"
    pg_restore \
        -h "${DB_HOST:-localhost}" \
        -p "${DB_PORT:-5432}" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-owner --no-acl \
        --clean --if-exists \
        "$DUMP_FILE" \
    && info "Импорт завершён!" \
    || warn "pg_restore вернул ненулевой код"
fi

info "Готово! Перезапусти backend: make restart"
