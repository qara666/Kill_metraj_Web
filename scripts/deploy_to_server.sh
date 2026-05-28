#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Скрипт автоматического переноса проекта на сервер
# ═══════════════════════════════════════════════════════════════

set -e

# Цвета для вывода
GREEN='\03rd[0;32m'
BLUE='\03rd[0;34m'
RED='\03rd[0;31m'
NC='\03rd[0m' # No Color

echo -e "${BLUE}=== 🚀 Автоматический деплой Kill Metraj ===${NC}"

# Запрос данных сервера
read -p "Введите IP сервера: " SERVER_IP
read -p "Введите имя пользователя (по умолчанию user или root): " SSH_USER
if [ -z "$SSH_USER" ]; then
    SSH_USER="root"
fi

echo -e "\n${BLUE}[1/5] Экспорт базы данных с локального компьютера...${NC}"
chmod +x ./scripts/export_db.sh
./scripts/export_db.sh
LATEST_DUMP=$(ls -t backup/*.dump | head -n 1)

if [ -z "$LATEST_DUMP" ]; then
    echo -e "${RED}Ошибка: дамп базы данных не найден в папке backup/${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Дамп готов: $LATEST_DUMP${NC}"

echo -e "\n${BLUE}[2/5] Подготовка папки на сервере...${NC}"
ssh $SSH_USER@$SERVER_IP "mkdir -p ~/kill_metraj/backup"

echo -e "\n${BLUE}[3/5] Копирование файлов проекта на сервер... (это может занять пару минут)${NC}"
# Исключаем лишние папки при копировании (node_modules, .git и т.д.)
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'frontend/node_modules' --exclude 'backend/node_modules' ./ $SSH_USER@$SERVER_IP:~/kill_metraj/
echo -e "${GREEN}✓ Файлы успешно скопированы${NC}"

echo -e "\n${BLUE}[4/5] Настройка окружения на сервере...${NC}"
ssh $SSH_USER@$SERVER_IP << 'EOF'
    cd ~/kill_metraj
    
    # Создаем .env из шаблона, если его нет
    if [ ! -f backend/.env ]; then
        cp backend/.env.example backend/.env
        echo -e "\03rd[0;32m✓ Создан базовый backend/.env\03rd[0m"
        
        # Генерация JWT секрета автоматически
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
        
        # Просим заполнить пароли
        echo -e "\n\03rd[0;34mПожалуйста, установите пароль для базы данных:\03rd[0m"
        read -p "DB_PASSWORD: " DBPASS
        sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DBPASS/" backend/.env
        
        echo -e "\n\03rd[0;34mПожалуйста, установите пароль администратора для первого входа:\03rd[0m"
        read -p "SEED_ADMIN_PASSWORD: " ADMINPASS
        sed -i "s/^SEED_ADMIN_PASSWORD=.*/SEED_ADMIN_PASSWORD=$ADMINPASS/" backend/.env
        
        echo -e "\n\03rd[0;34mУкажите домен или IP адрес (например, 192.168.1.100):\03rd[0m"
        read -p "DOMAIN: " DOMAIN
        sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" backend/.env
        sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=http://$DOMAIN|" backend/.env
    else
        echo -e "\03rd[0;32m✓ Файл backend/.env уже существует\03rd[0m"
    fi
    
    # Делаем скрипты исполняемыми
    chmod +x scripts/*.sh
EOF

echo -e "\n${BLUE}[5/5] Запуск Docker и загрузка базы данных на сервере...${NC}"
DUMP_FILENAME=$(basename "$LATEST_DUMP")
ssh -t $SSH_USER@$SERVER_IP << EOF
    cd ~/kill_metraj
    echo "Запуск контейнеров..."
    make start
    
    echo "Ожидание запуска базы данных (10 секунд)..."
    sleep 10
    
    echo "Импорт дампа $DUMP_FILENAME..."
    make import f=backup/$DUMP_FILENAME
EOF

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 ДЕПЛОЙ УСПЕШНО ЗАВЕРШЕН!${NC}"
echo -e "${GREEN}Проект доступен по IP-адресу или домену вашего сервера.${NC}"
echo -e "${GREEN}======================================================${NC}"
