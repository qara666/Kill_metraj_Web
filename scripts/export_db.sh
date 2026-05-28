#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Kill Metraj — Export local PostgreSQL → dump file
# ═══════════════════════════════════════════════════════════
# Использование:
#   ./scripts/export_db.sh                   # использовать .env
#   ./scripts/export_db.sh my_dump.sql       # указать имя файла
#
# Результат: backup/kill_metraj_YYYY-MM-DD.sql
# ═══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# Загружаем локальные переменные из backend/.env
if [ -f backend/.env ]; then
    set -a
    source backend/.env
    set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-kill_metraj}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

BACKUP_DIR="${SCRIPT_DIR}/backup"
mkdir -p "$BACKUP_DIR"

OUTPUT_FILE="${1:-${BACKUP_DIR}/${DB_NAME}_$(date +%Y-%m-%d_%H-%M-%S).sql}"

echo "→ Экспорт БД: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "→ Файл: ${OUTPUT_FILE}"

export PGPASSWORD="$DB_PASSWORD"

pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    --format=custom \
    -f "${OUTPUT_FILE}.dump"

echo "✓ Экспорт завершён: ${OUTPUT_FILE}.dump"
echo "  Размер: $(du -h "${OUTPUT_FILE}.dump" | cut -f1)"
echo ""
echo "  Для импорта на сервере:"
echo "  scp ${OUTPUT_FILE}.dump user@server:~/"
echo "  ./scripts/import_db.sh ${OUTPUT_FILE}.dump"
