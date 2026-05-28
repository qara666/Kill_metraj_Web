#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Kill Metraj — Import PostgreSQL dump → Docker container
# ═══════════════════════════════════════════════════════════
# Использование:
#   ./scripts/import_db.sh kill_metraj_2026-05-28.dump
#
# Должно быть запущено на сервере, где запущен km-postgres.
# ═══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ]; then
    echo "Ошибка: укажите файл дампа"
    echo "  Использование: $0 <dump_file>"
    echo "  Пример: $0 backup/kill_metraj_2026-05-28.dump"
    exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
    echo "Ошибка: файл не найден: $DUMP_FILE"
    exit 1
fi

# Загружаем переменные
if [ -f backend/.env ]; then
    set -a
    source backend/.env
    set +a
fi

DB_NAME="${DB_NAME:-kill_metraj}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-changeme_in_production}"
CONTAINER="km-postgres"

# Проверяем, запущен ли контейнер
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "Ошибка: контейнер ${CONTAINER} не запущен."
    echo "  Запустите: docker compose -f docker-compose.prod.yml up -d postgres"
    exit 1
fi

echo "→ Импорт ${DUMP_FILE} в ${DB_NAME} (контейнер ${CONTAINER})"

export PGPASSWORD="$DB_PASSWORD"

if [[ "$DUMP_FILE" == *.dump ]]; then
    # Custom format (pg_dump -Fc)
    pg_restore \
        -h localhost \
        -p 5432 \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        -v \
        "$DUMP_FILE" 2>&1 | tail -20
else
    # Plain SQL
    psql \
        -h localhost \
        -p 5432 \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$DUMP_FILE"
fi

echo "✓ Импорт завершён!"
