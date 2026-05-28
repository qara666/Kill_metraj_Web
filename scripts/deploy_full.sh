#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Kill Metraj — Full Server Deploy
# ───────────────────────────────────────────────────────────
# Скрипт для первого развёртывания на сервере.
#
# 1. Клонирует/копирует проект на сервер
# 2. Настраивает .env
# 3. Собирает и запускает продакшн стек
# 4. Импортирует данные (если есть dump)
# ═══════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; }
header()  { echo -e "\n${CYAN}══════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════════${NC}"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ─── Проверки ──────────────────────────────────────────
header "Pre-flight checks"

if ! command -v docker &>/dev/null; then
    error "Docker не установлен"
    exit 1
fi
info "Docker $(docker --version)"

if ! docker compose version &>/dev/null; then
    error "Docker Compose v2 не найден"
    exit 1
fi
info "Docker Compose $(docker compose version --short)"

# ─── Проверка .env ─────────────────────────────────────
header "Environment setup"

if [ ! -f backend/.env ]; then
    warn "backend/.env не найден. Создаю из .env.production..."
    cp backend/.env.production backend/.env
    warn "!!! Отредактируйте backend/.env перед запуском: DB_PASSWORD, JWT_SECRET, EXTERNAL_API_KEY, DOMAIN !!!"
    exit 1
fi

# Генерация секретов если они по умолчанию
if grep -q 'change-this\|changeme' backend/.env 2>/dev/null; then
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -A n -t x1 | tr -d ' \n' | head -c 64)
    SETUP_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -A n -t x1 | tr -d ' \n' | head -c 64)
    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
    sed -i.bak "s/^SETUP_SECRET=.*/SETUP_SECRET=$SETUP_SECRET/" backend/.env
    rm -f backend/.env.bak
    info "JWT_SECRET и SETUP_SECRET сгенерированы"
fi

set -a; source backend/.env; set +a

info "backend/.env — OK"

# ─── Pull images ───────────────────────────────────────
header "Pulling Docker images"
docker compose -f docker-compose.prod.yml pull

# ─── Build & Start ─────────────────────────────────────
header "Building & starting services"
docker compose -f docker-compose.prod.yml up --build -d

# Ожидание готовности
info "Ожидание готовности backend..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:5001/health/readiness >/dev/null 2>&1; then
        info "Backend готов"
        break
    fi
    if [ "$i" -eq 30 ]; then
        warn "Backend не ответил за 30 попыток. Проверьте логи: docker compose -f docker-compose.prod.yml logs backend"
    fi
    sleep 2
done

# ─── Импорт данных (если есть dump) ────────────────────
if [ -f "${PROJECT_DIR}/backup/latest.dump" ]; then
    header "Importing database from backup/latest.dump"
    export DB_NAME="${DB_NAME:-kill_metraj}"
    export DB_USER="${DB_USER:-postgres}"
    export DB_PASSWORD="${DB_PASSWORD:-changeme_in_production}"

    PGPASSWORD="$DB_PASSWORD" pg_restore \
        -h localhost \
        -p 5432 \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-owner --no-acl \
        --clean --if-exists \
        "${PROJECT_DIR}/backup/latest.dump" && \
    info "Data imported" || \
    warn "Import failed (maybe empty database is OK)"
fi

# ─── Status ────────────────────────────────────────────
header "Stack status"
docker compose -f docker-compose.prod.yml ps

header "Deploy complete!"
echo ""
echo "  Frontend:  https://${DOMAIN:-localhost}"
echo "  API:       https://${DOMAIN:-localhost}/api/health"
echo "  PG:        localhost:5432"
echo "  Redis:     localhost:6379"
echo ""
echo "  Commands:"
echo "    docker compose -f docker-compose.prod.yml logs -f backend"
echo "    docker compose -f docker-compose.prod.yml restart backend"
echo "    docker compose -f docker-compose.prod.yml down"
echo ""
