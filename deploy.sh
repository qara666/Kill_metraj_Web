#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC} $*"; }
header()  { echo -e "\n${CYAN}════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}════════════════════════════════════${NC}"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ─── Настройки ────────────────────────────────────────────
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-}"

check_docker() {
    if ! command -v docker &>/dev/null; then
        error "Docker not installed"
        exit 1
    fi
    if ! docker compose version &>/dev/null; then
        error "Docker Compose v2 not found"
        exit 1
    fi
    info "Docker $(docker --version)"
}

check_env() {
    if [ ! -f backend/.env ]; then
        warn "backend/.env not found. Creating from .env.production..."
        if [ -f backend/.env.production ]; then
            cp backend/.env.production backend/.env
        else
            cp backend/.env.example backend/.env
        fi
        warn "Edit backend/.env before starting! Set DB_PASSWORD, JWT_SECRET, EXTERNAL_API_KEY"
        exit 1
    fi
    info "backend/.env found"
}

gen_secret() {
    if command -v openssl &>/dev/null; then
        openssl rand -hex 32
    else
        head -c 64 /dev/urandom | od -A n -t x1 | tr -d ' \n' | head -c 64
    fi
}

protect_env() {
    local env_file="backend/.env"
    local changed=false

    if grep -q 'changeme_in_production\|change-this\|changeme\|your-super-secret\|your-api-key\|changeme_on_first_login' "$env_file" 2>/dev/null; then
        warn "Default secrets found, regenerating..."

        if grep -q '^JWT_SECRET=change-this' "$env_file"; then
            sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$(gen_secret)/" "$env_file"
            info "JWT_SECRET regenerated"
            changed=true
        fi
        if grep -q '^SETUP_SECRET=change-this' "$env_file"; then
            sed -i.bak "s/^SETUP_SECRET=.*/SETUP_SECRET=$(gen_secret)/" "$env_file"
            info "SETUP_SECRET regenerated"
            changed=true
        fi
        rm -f "$env_file.bak"
    fi

    if [ "$changed" = true ]; then
        warn "Don't forget to set: DB_PASSWORD, EXTERNAL_API_KEY, SEED_ADMIN_PASSWORD"
    fi
}

compose_cmd() {
    local args=("-f" "$COMPOSE_FILE")
    if [ -n "$COMPOSE_PROFILE" ]; then
        args+=("--profile" "$COMPOSE_PROFILE")
    fi
    echo "docker compose ${args[*]}"
}

start_stack() {
    info "Starting Kill Metraj stack (${COMPOSE_FILE})..."
    if [ -n "$COMPOSE_PROFILE" ]; then
        info "  Profile: ${COMPOSE_PROFILE}"
    fi
    eval "$(compose_cmd) up --build -d"
    eval "$(compose_cmd) ps"
    echo ""
    info "Frontend: http://localhost:${FRONTEND_PORT:-80}"
    info "Backend:  http://localhost:${API_PORT:-5001}"
    info "Health:   http://localhost:${API_PORT:-5001}/api/health"
}

stop_stack() {
    info "Stopping stack..."
    eval "$(compose_cmd) down"
}

logs() {
    local service="${2:-backend}"
    eval "$(compose_cmd) logs -f --tail=100 $service"
}

restart() {
    local service="${2:-backend}"
    info "Restarting $service..."
    eval "$(compose_cmd) restart $service"
}

status() {
    eval "$(compose_cmd) ps"
}

# ─── Команды ──────────────────────────────────────────────
case "${1:-help}" in
    start)
        check_docker
        check_env
        protect_env
        start_stack
        ;;
    stop)
        stop_stack
        ;;
    restart)
        restart "$@"
        ;;
    logs)
        logs "$@"
        ;;
    status)
        status
        ;;
    check)
        check_docker
        check_env
        ;;
    start:prod)
        COMPOSE_FILE="docker-compose.prod.yml"
        check_docker
        check_env
        protect_env
        start_stack
        ;;
    start:routing)
        COMPOSE_FILE="docker-compose.prod.yml"
        COMPOSE_PROFILE="routing"
        check_docker
        check_env
        info "Starting routing services: OSRM, Valhalla, Nominatim"
        start_stack
        ;;
    start:cdc)
        COMPOSE_FILE="docker-compose.prod.yml"
        COMPOSE_PROFILE="cdc"
        check_docker
        info "Starting CDC services: Kafka, Zookeeper, Debezium"
        start_stack
        ;;
    start:full)
        COMPOSE_FILE="docker-compose.prod.yml"
        COMPOSE_PROFILE="full"
        check_docker
        check_env
        protect_env
        info "Starting full stack (all services)..."
        start_stack
        ;;
    export)
        ./scripts/export_db.sh
        ;;
    import)
        ./scripts/import_db.sh "${2:-backup/latest.dump}"
        ;;
    deploy)
        ./scripts/deploy_full.sh
        ;;
    init)
        check_docker
        info "Creating env from .env.production..."
        cp backend/.env.production backend/.env
        info "Done. Edit backend/.env then run: $0 start"
        ;;
    *)
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "  start         — Build & start (docker-compose.yml)"
        echo "  start:prod    — Start production stack (Caddy + HTTPS)"
        echo "  start:routing — Start with OSRM + Valhalla"
        echo "  start:cdc     — Start with Kafka + Debezium"
        echo "  start:full    — Start ALL services"
        echo "  stop          — Stop all containers"
        echo "  restart [svc] — Restart service (default: backend)"
        echo "  logs [svc]    — Follow logs (default: backend)"
        echo "  status        — Container status"
        echo "  export        — Dump local DB to file"
        echo "  import [file] — Import DB dump"
        echo "  deploy        — Full server deploy script"
        echo "  init          — Init backend/.env from template"
        exit 1
        ;;
esac
