# 24/7 Background Dashboard Data Fetching - Deployment Guide

## Overview

This system enables continuous dashboard data fetching that works 24/7, even when browser tabs are closed or sleeping. It uses:
- **PostgreSQL** for data persistence with LISTEN/NOTIFY
- **Background Worker** for continuous API polling
- **WebSockets (Socket.io)** for real-time client updates
- **PM2** for process management

---

## Prerequisites

- PostgreSQL database running
- Node.js 16+ installed
- PM2 installed globally: `npm install -g pm2`
- Backend and frontend dependencies installed

---

## Step 1: Run Database Migration

Execute the SQL migration to create the dashboard cache table:

```bash
cd backend

# Option 1: Using psql command line
psql -U your_username -d kill_metraj -f migrations/001_create_dashboard_cache.sql

# Option 2: Using node-pg-migrate (if installed)
npm run migrate up

# Option 3: Manually via PostgreSQL client
# Copy contents of migrations/001_create_dashboard_cache.sql and execute
```

**Verify migration:**
```sql
-- Check if table exists
SELECT * FROM api_dashboard_cache LIMIT 1;

-- Check if trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'dashboard_update_trigger';
```

---

## Step 2: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Database Configuration (should already exist)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kill_metraj
DB_USER=postgres
DB_PASSWORD=your_password

# Dashboard Fetcher Configuration
DASHBOARD_FETCH_INTERVAL=5000          # 5 seconds (in milliseconds)
DASHBOARD_MAX_RETRIES=5                # Max retry attempts on error
DASHBOARD_BASE_BACKOFF=5000            # Base backoff time (in milliseconds)
DASHBOARD_DATA_RETENTION_DAYS=7        # Keep data for 7 days
CLEANUP_SCHEDULE="0 3 * * *"           # Daily at 3 AM

# External API Configuration (should already exist)
EXTERNAL_API_URL=http://app.yaposhka.kh.ua:4999/api/v1/dashboard
EXTERNAL_API_KEY=your_api_key_here

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

---

## Step 3: Test Components Individually

### Test 1: Database Connection
```bash
cd backend
node -e "const { Pool } = require('pg'); const pool = new Pool(); pool.query('SELECT NOW()').then(r => console.log('✅ DB OK:', r.rows[0])).catch(e => console.error('❌ DB Error:', e.message));"
```

### Test 2: Background Worker
```bash
cd backend
node workers/dashboardFetcher.js
```

**Expected output:**
```
============================================================
Dashboard Background Fetcher
============================================================
API URL: http://app.yaposhka.kh.ua:4999/api/v1/dashboard
Fetch interval: 5000ms
Max retries: 5
Base backoff: 5000ms
============================================================
✓ Database connection successful
✓ Dashboard fetcher started
============================================================
[2026-01-28T03:45:00.000Z] Fetching dashboard data... (Attempt 1)
  ✓ Data stored successfully (234ms) - Success rate: 100.0%
```

Press `Ctrl+C` to stop. If you see errors, check:
- Database connection
- External API key
- Network connectivity

### Test 3: Cleanup Job
```bash
cd backend
node workers/cleanupJob.js
```

**Expected output:**
```
============================================================
Dashboard Cache Cleanup Job
============================================================
Schedule: 0 3 * * *
Retention: 7 days
============================================================
✓ Cleanup job scheduled
Running initial cleanup...
[2026-01-28T03:45:00.000Z] Running cleanup job...
  Retention: 7 days
  ✓ Cleanup completed (45ms)
    Deleted: 0 records
    Remaining: 12 records
    Size before: 16 kB
    Size after: 16 kB
```

### Test 4: Main Server with WebSockets
```bash
cd backend
npm start
```

**Expected output:**
```
✅ Сервер работает на http://localhost:5001
📊 Dashboard API: http://localhost:5001/api/v1
🔐 Auth API: http://localhost:5001/api/auth
👥 Users API: http://localhost:5001/api/users
📡 Telegram API: http://localhost:5001/api/telegram
🔧 Debug logs: http://localhost:5001/debug/logs
🔌 WebSocket: ws://localhost:5001

✅ PostgreSQL LISTEN setup complete
✅ Listening for dashboard updates via PostgreSQL NOTIFY
```

---

## Step 4: Deploy with PM2

### Start All Processes
```bash
cd backend
pm2 start ecosystem.config.js
```

**Expected output:**
```
┌─────┬────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name               │ mode    │ status  │ restart  │
├─────┼────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ kill-metraj-api    │ fork    │ online  │ 0        │
│ 1   │ dashboard-fetcher  │ fork    │ online  │ 0        │
│ 2   │ cleanup-job        │ fork    │ online  │ 0        │
└─────┴────────────────────┴─────────┴─────────┴──────────┘
```

### Monitor Processes
```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs

# View specific process logs
pm2 logs dashboard-fetcher
pm2 logs kill-metraj-api
pm2 logs cleanup-job

# Check status
pm2 status
```

### Save PM2 Configuration
```bash
# Save current process list
pm2 save

# Setup auto-start on system reboot
pm2 startup

# Follow the instructions printed by the command above
```

---

## Step 5: Verify System is Working

### Check 1: Database is Receiving Data
```sql
-- Check latest records
SELECT 
    id,
    created_at,
    status_code,
    LEFT(data_hash, 8) as hash_preview
FROM api_dashboard_cache
ORDER BY created_at DESC
LIMIT 10;

-- Check data frequency (should be ~1 record every 5 seconds)
SELECT 
    COUNT(*) as total_records,
    MIN(created_at) as oldest,
    MAX(created_at) as newest,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / COUNT(*) as avg_interval_seconds
FROM api_dashboard_cache
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

**Expected:** ~60 records in last 5 minutes, avg interval ~5 seconds

### Check 2: WebSocket is Broadcasting
Open browser console on dashboard page:
```javascript
// Should see logs like:
[SocketService] ✅ Connected to WebSocket server
[SocketService] 📥 Dashboard update received: { timestamp: "2026-01-28T03:45:00.000Z", status: 200 }
```

### Check 3: Test Browser Sleep/Wake
1. Open Dashboard in browser
2. Minimize browser for 2 minutes
3. Restore browser
4. Check console - should see reconnection and data sync

### Check 4: Test Tab Close/Reopen
1. Close all browser tabs
2. Wait 1 minute
3. Check database - data should still be accumulating
4. Reopen Dashboard
5. Should receive latest data immediately

---

## Step 6: Frontend Deployment

The frontend changes are already integrated. Just rebuild:

```bash
cd frontend
npm run build

# If using Vite dev server
npm run dev
```

**Verify WebSocket connection:**
- Open browser DevTools → Network → WS (WebSockets)
- Should see active connection to `ws://localhost:5001`
- Messages should appear every ~5 seconds

---

## Troubleshooting

### Problem: Worker keeps crashing
**Solution:**
```bash
# Check logs
pm2 logs dashboard-fetcher --lines 50

# Common issues:
# 1. Invalid API key → Update EXTERNAL_API_KEY in .env
# 2. Database connection failed → Check DB credentials
# 3. Network timeout → Check firewall/network settings
```

### Problem: No data in database
**Solution:**
```bash
# Check worker status
pm2 status dashboard-fetcher

# Restart worker
pm2 restart dashboard-fetcher

# Check worker logs for errors
pm2 logs dashboard-fetcher --lines 100
```

### Problem: WebSocket not connecting
**Solution:**
```bash
# Check if main server is running
pm2 status kill-metraj-api

# Check server logs
pm2 logs kill-metraj-api

# Verify CORS settings in simple_server.js
# Ensure FRONTEND_URL matches your frontend URL
```

### Problem: Database growing too large
**Solution:**
```sql
-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('api_dashboard_cache'));

-- Manually run cleanup
SELECT cleanup_old_dashboard_data(7); -- Keep last 7 days

-- Adjust retention in .env
DASHBOARD_DATA_RETENTION_DAYS=3  -- Keep only 3 days
```

### Problem: Too many duplicate records
**Solution:**
- Check if data_hash deduplication is working
```sql
SELECT data_hash, COUNT(*) as count
FROM api_dashboard_cache
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY data_hash
HAVING COUNT(*) > 1;
```

If duplicates exist, check worker logs for hash calculation errors.

---

## Performance Tuning

### High-Frequency Updates (1 second interval)
```bash
# .env
DASHBOARD_FETCH_INTERVAL=1000  # 1 second
DASHBOARD_DATA_RETENTION_DAYS=1  # Keep only 1 day
```

### Low-Frequency Updates (30 seconds interval)
```bash
# .env
DASHBOARD_FETCH_INTERVAL=30000  # 30 seconds
DASHBOARD_DATA_RETENTION_DAYS=30  # Keep 30 days
```

### Reduce Database I/O
Use unlogged table (faster writes, but data lost on crash):
```sql
ALTER TABLE api_dashboard_cache SET UNLOGGED;
```

Revert to logged:
```sql
ALTER TABLE api_dashboard_cache SET LOGGED;
```

---

## Monitoring

### PM2 Web Interface
```bash
pm2 install pm2-server-monit
pm2 web
# Access http://localhost:9615
```

### Database Monitoring
```sql
-- Check table statistics
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_tup_ins AS inserts,
    n_tup_upd AS updates,
    n_tup_del AS deletes
FROM pg_stat_user_tables
WHERE tablename = 'api_dashboard_cache';
```

### Worker Health Check Script
Create `backend/scripts/health-check.sh`:
```bash
#!/bin/bash
pm2 jlist | jq '.[] | select(.name=="dashboard-fetcher") | {name, status, restarts, uptime}'
```

---

## Rollback Plan

If you need to rollback to the old polling system:

1. **Stop PM2 processes:**
```bash
pm2 stop dashboard-fetcher
pm2 stop cleanup-job
pm2 delete dashboard-fetcher
pm2 delete cleanup-job
```

2. **Revert frontend changes:**
```bash
cd frontend/src/components/shared
# Replace useDashboardWebSocket with useDashboardAutoRefresh in GlobalDashboardFetcher.tsx
```

3. **Restart main server:**
```bash
pm2 restart kill-metraj-api
```

The old polling system will resume working.

---

## Success Criteria

✅ **Worker runs 24/7 without crashes**
- Check: `pm2 status` shows "online" for dashboard-fetcher
- Check: Uptime > 24 hours

✅ **Data fetched continuously**
- Check: Database has new records every 5 seconds
- Check: No gaps in created_at timestamps

✅ **WebSocket updates work**
- Check: Browser console shows "Dashboard update received"
- Check: Updates appear even when tab was sleeping

✅ **System recovers from errors**
- Check: Worker logs show retry attempts
- Check: Worker returns to normal after API outage

✅ **Database size is manageable**
- Check: Table size < 100MB
- Check: Cleanup job runs daily

---

## Next Steps

1. **Monitor for 24 hours** to ensure stability
2. **Adjust fetch interval** based on data freshness requirements
3. **Set up alerts** for worker crashes (PM2 + monitoring service)
4. **Configure backups** for api_dashboard_cache table
5. **Optimize queries** if dashboard becomes slow

---

## Support

For issues or questions:
1. Check PM2 logs: `pm2 logs`
2. Check database: `SELECT * FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 10`
3. Review this guide's Troubleshooting section
4. Check backend/logs/ directory for detailed logs

---

**Deployment Date:** 2026-01-28
**Version:** 1.0.0
**Status:** ✅ Ready for Production
