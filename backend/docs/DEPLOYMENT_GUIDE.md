# Руководство по развертыванию: Redis + Kafka CDC

## Предварительные требования

- Установлен Docker Desktop
- PostgreSQL с включенной логической репликацией
- Запущенный Node.js бэкенд

## Шаг 1: Развертывание стека Kafka + Debezium

### Использование Docker Compose (рекомендуется)

```bash
cd backend
docker compose -f docker-compose.debezium.yml up -d
```

**Примечание:** Если у вас старая версия Docker, используйте `docker-compose` вместо `docker compose`.

### Проверка развертывания

```bash
# Проверка работы всех сервисов
docker compose -f docker-compose.debezium.yml ps

# Ожидаемый вывод:
# NAME                     STATUS
# kill-metraj-zookeeper    Up
# kill-metraj-kafka        Up (healthy)
# kill-metraj-debezium     Up (healthy)
# kill-metraj-kafka-ui     Up
```

### Доступ к Kafka UI

Откройте http://localhost:8080 для мониторинга топиков и сообщений Kafka.

## Шаг 2: Включение логической репликации PostgreSQL

### Поиск конфигурации PostgreSQL

```bash
# macOS (Homebrew)
/opt/homebrew/var/postgresql@14/postgresql.conf

# Linux
/etc/postgresql/14/main/postgresql.conf
```

### Редактирование конфигурации

Добавьте эти строки:
```conf
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4
```

### Перезапуск PostgreSQL

```bash
# macOS (Homebrew)
brew services restart postgresql@14

# Linux
sudo systemctl restart postgresql
```

### Проверка

```sql
SHOW wal_level;  -- Должно вернуть 'logical'
```

## Шаг 3: Настройка коннектора Debezium

### Обновление конфигурации коннектора

Отредактируйте `backend/debezium-connector-config.json` и обновите:
- `database.password`: Ваш пароль PostgreSQL
- `database.dbname`: Имя вашей базы данных (по умолчанию: kill_metraj)

### Создание коннектора

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @backend/debezium-connector-config.json
```

### Проверка коннектора

```bash
curl http://localhost:8083/connectors/dashboard-connector/status | json_pp
```

Ожидаемый вывод:
```json
{
  "name": "dashboard-connector",
  "connector": {
    "state": "RUNNING"
  },
  "tasks": [
    {
      "id": 0,
      "state": "RUNNING"
    }
  ]
}
```

## Шаг 4: Включение CDC в бэкенде

### Обновление .env

```bash
# Включение CDC
CDC_ENABLED=true
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=kill_metraj.public.api_dashboard_cache
```

### Перезапуск бэкенда

```bash
lsof -ti:5001 | xargs kill -9 || true
node backend/simple_server.js
```

### Проверка CDC потребителя

Проверьте логи:
```
Kafka consumer connected
Subscribed to topic: kill_metraj.public.api_dashboard_cache
Kafka consumer listening for dashboard updates
```

## Шаг 5: Тестирование конвейера CDC

### Триггер изменения базы данных

```sql
INSERT INTO api_dashboard_cache (payload, data_hash, status_code)
VALUES ('{"orders": [], "couriers": []}', 'test123', 200);
```

### Ожидаемые логи

**Бэкенд:**
```
Dashboard update received from Debezium CDC
Cache invalidated due to CDC event
CDC update broadcasted to X clients
```

**Kafka UI (http://localhost:8080):**
- Перейдите в Topics → `kill_metraj.public.api_dashboard_cache`
- Увидите новое сообщение с вставленными данными

## Устранение неполадок

### Коннектор не запускается

**Проверьте логи Debezium:**
```bash
docker logs kill-metraj-debezium
```

**Распространенные проблемы:**
- PostgreSQL `wal_level` не установлен в `logical`
- Неверные учетные данные базы данных
- Фаервол блокирует порт 5432

**Исправление:**
```bash
# Перезапуск PostgreSQL после изменения конфигурации
brew services restart postgresql@14

# Удаление и пересоздание коннектора
curl -X DELETE http://localhost:8083/connectors/dashboard-connector
curl -X POST http://localhost:8083/connectors -d @backend/debezium-connector-config.json
```

### Kafka потребитель не подключается

**Проверьте, что Kafka запущена:**
```bash
docker logs kill-metraj-kafka
```

**Тест соединения:**
```bash
docker exec kill-metraj-kafka kafka-broker-api-versions \
  --bootstrap-server localhost:9092
```

**Исправление:**
```bash
# Перезапуск стека Kafka
docker compose -f docker-compose.debezium.yml restart
```

### Сообщения не приходят

**Проверьте существование топика:**
```bash
docker exec kill-metraj-kafka kafka-topics \
  --list --bootstrap-server localhost:9092
```

**Мониторинг сообщений:**
```bash
docker exec kill-metraj-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic kill_metraj.public.api_dashboard_cache \
  --from-beginning
```

## Мониторинг производительности

### Метрики Kafka

Доступ к Kafka UI по адресу http://localhost:8080:
- Отставание потребителя
- Пропускная способность сообщений
- Распределение разделов

### Метрики бэкенда

```bash
curl http://localhost:5001/metrics | grep kafka
```

## Очистка

### Остановка CDC (сохранение данных)

```bash
# Отключение в .env
CDC_ENABLED=false

# Перезапуск бэкенда
```

### Остановка стека Kafka

```bash
docker compose -f docker-compose.debezium.yml down
```

### Удаление всех данных

```bash
docker compose -f docker-compose.debezium.yml down -v
```

## Следующие шаги

- Мониторинг задержки CDC в продакшене
- Настройка кластера Kafka для высокой доступности
- Настройка политик хранения
- Реализация очереди недоставленных сообщений
