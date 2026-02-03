# Deployment Guide: Redis + Kafka CDC

## Prerequisites

- Docker Desktop installed
- PostgreSQL with logical replication enabled
- Node.js backend running

## Step 1: Deploy Kafka + Debezium Stack

### Using Docker Compose (Recommended)

```bash
cd backend
docker compose -f docker-compose.debezium.yml up -d
```

**Note:** If you have older Docker, use `docker-compose` instead of `docker compose`.

### Verify Deployment

```bash
# Check all services are running
docker compose -f docker-compose.debezium.yml ps

# Expected output:
# NAME                     STATUS
# kill-metraj-zookeeper    Up
# kill-metraj-kafka        Up (healthy)
# kill-metraj-debezium     Up (healthy)
# kill-metraj-kafka-ui     Up
```

### Access Kafka UI

Open http://localhost:8080 to monitor Kafka topics and messages.

## Step 2: Enable PostgreSQL Logical Replication

### Find PostgreSQL Config

```bash
# macOS (Homebrew)
/opt/homebrew/var/postgresql@14/postgresql.conf

# Linux
/etc/postgresql/14/main/postgresql.conf
```

### Edit Configuration

Add these lines:
```conf
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4
```

### Restart PostgreSQL

```bash
# macOS (Homebrew)
brew services restart postgresql@14

# Linux
sudo systemctl restart postgresql
```

### Verify

```sql
SHOW wal_level;  -- Should return 'logical'
```

## Step 3: Configure Debezium Connector

### Update Connector Config

Edit `backend/debezium-connector-config.json` and update:
- `database.password`: Your PostgreSQL password
- `database.dbname`: Your database name (default: kill_metraj)

### Create Connector

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @backend/debezium-connector-config.json
```

### Verify Connector

```bash
curl http://localhost:8083/connectors/dashboard-connector/status | json_pp
```

Expected output:
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

## Step 4: Enable CDC in Backend

### Update .env

```bash
# Enable CDC
CDC_ENABLED=true
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=kill_metraj.public.api_dashboard_cache
```

### Restart Backend

```bash
lsof -ti:5001 | xargs kill -9 || true
node backend/simple_server.js
```

### Verify CDC Consumer

Check logs for:
```
✅ Kafka consumer connected
🎧 Subscribed to topic: kill_metraj.public.api_dashboard_cache
🎧 Kafka consumer listening for dashboard updates
```

## Step 5: Test CDC Pipeline

### Trigger Database Change

```sql
INSERT INTO api_dashboard_cache (payload, data_hash, status_code)
VALUES ('{"orders": [], "couriers": []}', 'test123', 200);
```

### Expected Logs

**Backend:**
```
📡 Dashboard update received from Debezium CDC
✨ Cache invalidated due to CDC event
📤 CDC update broadcasted to X clients
```

**Kafka UI (http://localhost:8080):**
- Navigate to Topics → `kill_metraj.public.api_dashboard_cache`
- See new message with the inserted data

## Troubleshooting

### Connector Not Starting

**Check Debezium logs:**
```bash
docker logs kill-metraj-debezium
```

**Common issues:**
- PostgreSQL `wal_level` not set to `logical`
- Incorrect database credentials
- Firewall blocking port 5432

**Fix:**
```bash
# Restart PostgreSQL after config change
brew services restart postgresql@14

# Delete and recreate connector
curl -X DELETE http://localhost:8083/connectors/dashboard-connector
curl -X POST http://localhost:8083/connectors -d @backend/debezium-connector-config.json
```

### Kafka Consumer Not Connecting

**Check Kafka is running:**
```bash
docker logs kill-metraj-kafka
```

**Test connection:**
```bash
docker exec kill-metraj-kafka kafka-broker-api-versions \
  --bootstrap-server localhost:9092
```

**Fix:**
```bash
# Restart Kafka stack
docker compose -f docker-compose.debezium.yml restart
```

### No Messages Arriving

**Check topic exists:**
```bash
docker exec kill-metraj-kafka kafka-topics \
  --list --bootstrap-server localhost:9092
```

**Monitor messages:**
```bash
docker exec kill-metraj-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic kill_metraj.public.api_dashboard_cache \
  --from-beginning
```

## Performance Monitoring

### Kafka Metrics

Access Kafka UI at http://localhost:8080:
- Consumer lag
- Message throughput
- Partition distribution

### Backend Metrics

```bash
curl http://localhost:5001/metrics | grep kafka
```

## Cleanup

### Stop CDC (Keep Data)

```bash
# Disable in .env
CDC_ENABLED=false

# Restart backend
```

### Stop Kafka Stack

```bash
docker compose -f docker-compose.debezium.yml down
```

### Remove All Data

```bash
docker compose -f docker-compose.debezium.yml down -v
```

## Next Steps

- Monitor CDC latency in production
- Set up Kafka cluster for high availability
- Configure retention policies
- Implement dead letter queue for failed messages
