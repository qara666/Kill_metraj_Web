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
PORT=${BACKEND_PORT} nohup node simple_server.js > "$ROOT_DIR/.backend.out.log" 2>&1 &
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
  # Освобождаем порт, если кто-то держит 5173 (например, предыдущий Vite)
  if lsof -i :${FRONTEND_PORT} -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    log "Порт ${FRONTEND_PORT} занят, освобождаю..."
    lsof -ti :${FRONTEND_PORT} | xargs kill -9 || true
    sleep 1
  fi
  nohup npm run dev > "$ROOT_DIR/.frontend.out.log" 2>&1 &
  FRONTEND_PID=$!
  log "Frontend PID: ${FRONTEND_PID} (логи: $ROOT_DIR/.frontend.out.log)"
else
  log "Не найден package.json во фронтенде"
  exit 1
fi

# Ждем пока Vite поднимется (ищем готовность через http и через лог-файл)
ATTEMPTS=0
until curl -s "http://localhost:${FRONTEND_PORT}" >/dev/null || grep -qi "Local:.*${FRONTEND_PORT}" "$ROOT_DIR/.frontend.out.log" 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 120 ]]; then
    log "Frontend не стартовал за разумное время"
    tail -n 50 "$ROOT_DIR/.frontend.out.log" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
log "Frontend готов"

URL="http://localhost:${FRONTEND_PORT}"
log "Открываю Safari: ${URL}"
# 1) Пробуем стандартный способ
if open -a "Safari" "${URL}"; then
  log "Safari открыт через open -a"
else
  log "Не удалось открыть через open -a, пробую AppleScript"
  # 2) Пробуем AppleScript
  if command -v osascript >/dev/null 2>&1; then
    if osascript -e "tell application \"Safari\" to make new document with properties {URL:\"${URL}\"}" -e "tell application \"Safari\" to activate"; then
      log "Safari открыт через AppleScript"
    else
      log "AppleScript не сработал, открываю в браузере по умолчанию"
      # 3) Открываем в браузере по умолчанию
      open "${URL}" || true
    fi
  else
    log "osascript недоступен, открываю в браузере по умолчанию"
    open "${URL}" || true
  fi
fi

log "Запущено. Для остановки закройте это окно или нажмите Ctrl+C."
wait




