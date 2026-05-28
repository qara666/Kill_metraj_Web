#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Kill Metraj — Установка Docker на чистый Ubuntu/Debian сервер
# ───────────────────────────────────────────────────────────────
# Запуск на сервере:
#   curl -fsSL https://raw.githubusercontent.com/.../server_setup.sh | bash
# или:
#   scp scripts/server_setup.sh user@server:~/
#   ssh user@server "bash server_setup.sh"
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
header() { echo -e "\n${CYAN}══════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════${NC}"; }

header "Kill Metraj — Server Setup"

# ─── 1. Проверяем ОС ──────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    info "ОС: $NAME $VERSION_ID"
else
    warn "Не удалось определить ОС. Продолжаем..."
fi

# ─── 2. Обновление пакетов ────────────────────────────────────
header "Обновление системы"
apt-get update -qq
apt-get install -y -qq \
    ca-certificates curl gnupg lsb-release \
    git make openssl wget
info "Базовые пакеты установлены"

# ─── 3. Установка Docker ──────────────────────────────────────
header "Установка Docker"
if command -v docker &>/dev/null; then
    info "Docker уже установлен: $(docker --version)"
else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    info "Docker $(docker --version) установлен"
fi

# ─── 4. Docker без sudo ───────────────────────────────────────
if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
    info "Пользователь $SUDO_USER добавлен в группу docker"
    warn "Перелогинься после установки, чтобы docker работал без sudo"
fi

# ─── 5. Автозапуск Docker ────────────────────────────────────
systemctl enable docker
systemctl start docker
info "Docker запущен и добавлен в автозапуск"

# ─── 6. Клонируем проект ─────────────────────────────────────
header "Настройка проекта"
PROJECT_DIR="${HOME}/kill_metraj"

if [ -d "$PROJECT_DIR" ]; then
    info "Директория $PROJECT_DIR уже существует. Обновляю..."
    cd "$PROJECT_DIR" && git pull
else
    warn "Укажи SSH/HTTPS URL репозитория:"
    warn "  Например: git clone git@github.com:yourorg/Kill_metraj_Web.git $PROJECT_DIR"
    warn "Или скопируй проект вручную через scp"
    warn ""
    warn "После клонирования выполни:"
    warn "  cd $PROJECT_DIR"
    warn "  make setup        ← создаст backend/.env из шаблона"
    warn "  nano backend/.env ← заполни пароли и домен"
    warn "  make start        ← запустит всё"
fi

# ─── 7. Firewall (UFW) ───────────────────────────────────────
header "Настройка firewall"
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp  comment 'SSH'    2>/dev/null || true
    ufw allow 80/tcp  comment 'HTTP'   2>/dev/null || true
    ufw allow 443/tcp comment 'HTTPS'  2>/dev/null || true
    ufw --force enable 2>/dev/null || true
    info "UFW настроен (22, 80, 443)"
else
    warn "UFW не найден. Настрой firewall вручную: порты 22, 80, 443"
fi

header "Установка завершена!"
echo ""
echo "  Следующие шаги:"
echo "  1. cd $PROJECT_DIR"
echo "  2. make setup"
echo "  3. nano backend/.env   ← заполни DB_PASSWORD, JWT_SECRET, DOMAIN"
echo "  4. make start"
echo ""
echo "  После запуска:"
echo "  make status    — статус контейнеров"
echo "  make logs      — логи backend"
echo ""
