#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT=5001
FRONTEND_PORT=5173

log() {
  echo "[$(date '+%H:%M:%S')] $*"
}

cleanup() {
  log "Останавливаю локальные процессы..."
  [[ -n "${BACKEND_PID:-}" ]] && kill ${BACKEND_PID} >/dev/null 2>&1 || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill ${FRONTEND_PID} >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

log "Старт backend на порту ${BACKEND_PORT}"
cd "$BACKEND_DIR"
nohup node simple_server.js > "$ROOT_DIR/.backend.out.log" 2>&1 &
BACKEND_PID=$!
log "Backend PID: ${BACKEND_PID} (логи: $ROOT_DIR/.backend.out.log)"

# Ждем пока backend поднимется (healthcheck)
ATTEMPTS=0
until curl -s "http://localhost:${BACKEND_PORT}/api/health" >/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 60 ]]; then
    log "Backend не стартовал за разумное время"
    exit 1
  fi
  sleep 1
done
log "Backend готов"

log "Старт frontend (Vite) на порту ${FRONTEND_PORT}"
cd "$FRONTEND_DIR"
if [[ -f package.json ]]; then
  # Устанавливать зависимости только если node_modules отсутствует
  if [[ ! -d node_modules ]]; then
    log "Устанавливаю зависимости фронтенда..."
    npm install --silent
  fi
  nohup npm run dev > "$ROOT_DIR/.frontend.out.log" 2>&1 &
  FRONTEND_PID=$!
  log "Frontend PID: ${FRONTEND_PID} (логи: $ROOT_DIR/.frontend.out.log)"
else
  log "Не найден package.json во фронтенде"
  exit 1
fi

# Ждем пока Vite поднимется
ATTEMPTS=0
until curl -s "http://localhost:${FRONTEND_PORT}" >/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 90 ]]; then
    log "Frontend не стартовал за разумное время"
    exit 1
  fi
  sleep 1
done
log "Frontend готов"

URL="http://localhost:${FRONTEND_PORT}"
log "Открываю Safari: ${URL}"
open -a "Safari" "${URL}" || open "${URL}"

log "Запущено. Для остановки закройте это окно или нажмите Ctrl+C."
wait


