// v7.5 HEARTBEAT: 2026-04-11
const express = require('express');
// v28.2: Initialize global store early to prevent crashes 
global.divisionStatusStore = global.divisionStatusStore || {};

const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('pg');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const ExcelService = require('./src/services/ExcelService');
const telegramRoutes = require('./src/routes/telegramRoutes');
const fastopertorRoutes = require('./src/routes/fastopertorRoutes');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const presetRoutes = require('./src/routes/presetRoutes');
const logRoutes = require('./src/routes/logRoutes');
const geocacheRoutes = require('./src/routes/geocacheRoutes');
const logger = require('./src/utils/logger');
// Константы и настройки загрузки файлов
const { generalLimiter, strictLimiter, uploadLimiter, telegramLimiter } = require('./src/middleware/rateLimiter');
const { sequelize, testConnection } = require('./src/config/database');
const { syncDatabase, AuditLog, DashboardCache } = require('./src/models');
const { authenticateToken } = require('./src/middleware/auth');
const { register: metricsRegister, metricsMiddleware, trackWebSocketConnection } = require('./src/middleware/metrics');
const { livenessProbe, readinessProbe, startupProbe } = require('./src/health/healthChecks');
const cacheService = require('./src/services/CacheService');
const DashboardConsumer = require('./src/consumers/DashboardConsumer');
const { startGrpcServer } = require('./src/grpc/server');

const compression = require('compression');
const app = express();
app.use(compression()); // Сжимаем ответы для ускорения передачи и экономии памяти
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Socket.io setup with CORS
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow local development (Vite, Localhost)
      if (!origin || origin.startsWith('http://localhost') || origin === FRONTEND_URL || origin === 'http://localhost:5174' || origin === 'http://127.0.0.1:5174') {
        return callback(null, true);
      }
      // Allow any Render subdomain
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  // CRITICAL: Start with polling and upgrade to websocket for Render compatibility
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});


// v28.2: Initialize global store early
global.divisionStatusStore = global.divisionStatusStore || {};
let turboCalculator = null;
let turboCalculatorReady = false; // v7.3: readiness flag for TurboCalculator initialization
// Today-cache status for diagnostics UI
global.turboTodayCacheExists = false;
global.turboTodayLastCalc = null;

// WebSocket authentication via handshake (JWT)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Not Authorized'));
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    if (decoded?.type === 'refresh') return next(new Error('Not Authorized'));
    socket.request.user = {
      id: decoded.userId,
      divisionId: decoded.divisionId || '',
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (err) {
    next(new Error('Not Authorized'));
  }
});

// Клиент PostgreSQL LISTEN (отдельно от Sequelize)
let pgListenClient = null;
const dashboardConsumer = new DashboardConsumer(io);
let grpcServer = null;


// v28.2: Global status store for background tasks hydration (already initialized at top)

// Global error handlers for better debugging on Render
process.on('uncaughtException', (err) => {
  console.error('КРИТИЧЕСКАЯ ОШИБКА:', err);
  logger.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное исключение (Uncaught Exception)', { error: err.message, stack: err.stack });
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('НЕОБРАБОТАННЫЙ ПРОМИС:', reason);
  logger.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное отклонение промиса (Unhandled Rejection)', { reason: reason?.message || reason, stack: reason?.stack });
});

const cors = require('cors');

// CRITICAL: Trust proxy for Render/Cloudflare load balancer
// This fixes: "ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false"
// Render's load balancer adds X-Forwarded-For headers, and we need to trust them for:
// - express-rate-limit to correctly identify client IPs
// - req.ip to return the real client IP instead of the proxy IP
// - Security and logging purposes
// app.set('trust proxy', 1); // Trust first hop
app.set('trust proxy', true); // Trust all hops on Render/Cloudflare

// CORS configuration for Render and local development
const corsOptions = {
  origin: (origin, callback) => {
    // Allow local development (localhost and 127.0.0.1)
    const allowed = !origin || 
                   origin.startsWith('http://localhost') || 
                   origin.startsWith('http://127.0.0.1') || 
                   origin === FRONTEND_URL ||
                   // Support alternate dev port (5174)
                   origin.startsWith('http://localhost:5174') ||
                   origin.startsWith('http://127.0.0.1:5174');
    
    if (allowed) {
      return callback(null, true);
    }
    // Allow any Render subdomain
    if (origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    // Log disallowed origins to help debugging
    logger.warn('[CORS] Источник запрещен Express:', { origin });
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-API-KEY', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400
};

// Explicitly handle local and production origins for preflight
const explicitAllow = (origin) => {
  if (!origin) return true;
  return origin.startsWith('http://localhost') || 
         origin.startsWith('http://127.0.0.1') ||
         origin === FRONTEND_URL ||
         origin.startsWith('http://localhost:5174') ||
         origin.startsWith('http://127.0.0.1:5174') ||
         origin.endsWith('.onrender.com');
};

// Custom Middleware to handle CORS Preflight explicitly
// This runs BEFORE the main CORS middleware to guarantee 204 response
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    
    if (explicitAllow(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-API-KEY, X-Requested-With, Accept, Origin, User-Agent');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400');
      return res.sendStatus(204);
    }
  }
  next();
});

app.use(cors(corsOptions));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * GEOCODING PROXY v2.0 — MULTI-USER SAFE
 * 
 * 3-LAYER PROTECTION against Nominatim 429 floods:
 *   1. SERVER-SIDE LRU CACHE  — same address → instant response, no external call
 *   2. IN-FLIGHT DEDUP       — 3 users geocode same addr → only 1 real HTTP req
 *   3. NOMINATIM RATE QUEUE  — serializes Nominatim calls at 1 req/sec server-wide
 * ──────────────────────────────────────────────────────────────────────────────
 */

// LAYER 1: LRU Cache — 2000 entries, 6 hour TTL
const GEOCODING_CACHE = new Map(); // url -> { data, ts }
const GEOCODING_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const GEOCODING_CACHE_MAX = 2000;

function getCachedGeocode(cacheKey) {
  const entry = GEOCODING_CACHE.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.ts > GEOCODING_CACHE_TTL) {
    GEOCODING_CACHE.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedGeocode(cacheKey, data) {
  // Evict oldest entry if at capacity
  if (GEOCODING_CACHE.size >= GEOCODING_CACHE_MAX) {
    const oldest = GEOCODING_CACHE.keys().next().value;
    GEOCODING_CACHE.delete(oldest);
  }
  GEOCODING_CACHE.set(cacheKey, { data, ts: Date.now() });
}

// LAYER 2: In-flight deduplication — map from cacheKey to pending Promise
const IN_FLIGHT = new Map();

// LAYER 3: Nominatim rate queue — max 1 req/sec server-wide
let _lastNominatimServerCall = 0;
let _nominatimServerQueue = [];
let _nominatimProcessing = false;

function enqueueNominatimFetch(fn) {
  return new Promise((resolve, reject) => {
    _nominatimServerQueue.push({ fn, resolve, reject });
    processNominatimQueue();
  });
}

async function processNominatimQueue() {
  if (_nominatimProcessing || _nominatimServerQueue.length === 0) return;
  _nominatimProcessing = true;
  while (_nominatimServerQueue.length > 0) {
    const { fn, resolve, reject } = _nominatimServerQueue.shift();
    // Enforce 1100ms between Nominatim calls (server-wide)
    const now = Date.now();
    const elapsed = now - _lastNominatimServerCall;
    if (elapsed < 1100) {
      await new Promise(r => setTimeout(r, 1100 - elapsed));
    }
    _lastNominatimServerCall = Date.now();
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    }
  }
  _nominatimProcessing = false;
}

function isNominatimUrl(url) {
  return url && url.includes('nominatim.openstreetmap.org');
}

app.get('/api/proxy/geocoding', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL parameter' });

  // Create a stable cache key (strip cache-buster params like _cb=...)
  const cacheKey = url.replace(/[?&]_cb=[^&]*/g, '');

  // LAYER 1: Serve from cache if available
  const cached = getCachedGeocode(cacheKey);
  if (cached) {
    res.setHeader('X-Geocache', 'HIT');
    return res.json(cached);
  }

  // LAYER 2: In-flight deduplication
  if (IN_FLIGHT.has(cacheKey)) {
    try {
      const data = await IN_FLIGHT.get(cacheKey);
      res.setHeader('X-Geocache', 'DEDUP');
      return res.json(data);
    } catch (error) {
      const status = error.response?.status || 500;
      return res.status(status).json({ error: 'Proxy request failed', message: error.message });
    }
  }

  // LAYER 3: Make the actual request
  const axios = require('axios');

  const doFetch = async () => {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'KillMetraj_DeliveryApp/2.0 (contact@killmetraj.ua)',
        'Referer': 'https://killmetraj.ua/',
        'Accept-Language': 'uk,ru,en'
      }
    });
    return response.data;
  };

  // Nominatim must go through rate limiter queue; others can go directly
  const fetchPromise = isNominatimUrl(url) ? enqueueNominatimFetch(doFetch) : doFetch();

  IN_FLIGHT.set(cacheKey, fetchPromise);

  try {
    const data = await fetchPromise;
    setCachedGeocode(cacheKey, data);
    res.setHeader('X-Geocache', 'MISS');
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    if (status === 429) {
      // v20.0: Special handling for 429 - return empty array to prevent client crashes
      res.setHeader('X-Geocode-Error', 'Nominatim-RateLimit');
      return res.status(200).json([]); // Return success with empty list
    }

    logger.error('Geocoding proxy request failed', {
      url: cacheKey,
      status,
      error: error.message
    });
    
    res.status(status).json([]); // Always return array for geocoding consistency
  } finally {
    IN_FLIGHT.delete(cacheKey);
  }
});

// Endpoint to view geocoding cache stats (admin debug)
app.get('/api/proxy/geocoding/stats', (req, res) => {
  res.json({
    cacheSize: GEOCODING_CACHE.size,
    inFlight: IN_FLIGHT.size,
    nominatimQueueLength: _nominatimServerQueue.length
  });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Metrics middleware (before logging to track all requests)
app.use(metricsMiddleware);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Apply rate limiting
app.use('/api/', generalLimiter);

// Настройка multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Службы
const excelService = new ExcelService();

// Маршруты
app.get('/', (req, res) => {
  res.json({ message: 'Simple Excel Server', status: 'running' });
});

// Тестовый эндпоинт для проверки Telegram роутов
app.get('/api/telegram/test', (req, res) => {
  res.json({
    success: true,
    message: 'Маршруты Telegram работают',
    timestamp: new Date().toISOString()
  });
});



app.post('/api/upload/excel', authenticateToken, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    logger.info('Начало обработки Excel файла');

    if (!req.file) {
      logger.error('Ошибка: файл не предоставлен');
      return res.status(400).json({
        success: false,
        error: 'Файл не предоставлен'
      });
    }

    // Log to AuditLog (Database)
    if (req.user) {
      // Skip logging for admins if requested
      if (req.user.role !== 'admin') {
        try {
          await AuditLog.create({
            userId: req.user.id,
            username: req.user.username,
            action: 'upload_excel',
            details: {
              fileName: req.file.originalname,
              fileSize: req.file.size,
              mimeType: req.file.mimetype
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || '',
            timestamp: new Date()
          });
        } catch (logError) {
          logger.error('Не удалось создать запись аудита для загрузки', { error: logError.message });
        }
      }
    }

    logger.info(`Получен файл: ${req.file.originalname}, размер: ${req.file.size} байт`);

    const divisionId = req.user?.divisionId || 'all';
    const result = await excelService.processExcelFile(req.file.buffer, divisionId);

    logger.info(`Результат: успех=${result.success}, заказов=${result.data?.orders?.length || 0}`);

    if (result.success) {
      // v6.20: FINAL Robust Split logic
      const divisionsToProcess = new Map();
      const allOrders = result.data.orders || [];
      const allCouriers = result.data.couriers || [];
      const allAddresses = result.data.addresses || [];
      
      if (divisionId === 'all' && allOrders.length > 0) {
          allOrders.forEach(o => {
              // Try multiple division ID fields used across different FO versions
              const dId = String(o.departmentId || o.division_id || o.divisionId || '1');
              if (!divisionsToProcess.has(dId)) {
                  divisionsToProcess.set(dId, { ...result.data, orders: [], couriers: [...allCouriers], addresses: [...allAddresses] });
              }
              divisionsToProcess.get(dId).orders.push(o);
          });
      } else {
          divisionsToProcess.set(String(divisionId), result.data);
      }

      // v6.20: Persistence with Protection
      try {
        const crypto = require('crypto');
        for (const [dId, dData] of divisionsToProcess.entries()) {
            if (!dData.orders || dData.orders.length === 0) continue;

            const n = dData.orders.length;
            let targetDate = new Date().toISOString().split('T')[0];
            const o = dData.orders[0];
            const sampleDateStr = o.creationDate || o['Дата создания'] || o.createdAt || o.date;
            if (sampleDateStr) {
                const dateOnly = String(sampleDateStr).split(' ')[0];
                if (dateOnly.includes('.')) { const p = dateOnly.split('.'); if (p.length === 3) targetDate = `${p[2]}-${p[0+1]}-${p[0]}`; }
                else if (dateOnly.includes('-')) { const p = dateOnly.split('-'); if (p[0].length === 4) targetDate = dateOnly; else if (p.length === 3) targetDate = `${p[2]}-${p[1]}-${p[0]}`; }
            }

            // Sync check
            const existing = await DashboardCache.findOne({ where: { division_id: dId, target_date: targetDate } });
            if (existing && existing.order_count > n && n < (existing.order_count * 0.1)) {
                logger.warn(`💾 [Protection] Skipping update for div ${dId} on ${targetDate}: current ${existing.order_count} > new ${n}`);
                continue;
            }

            const dataHash = crypto.createHash('sha256').update(JSON.stringify(dData)).digest('hex');
            await DashboardCache.upsert({
                division_id: dId,
                target_date: targetDate,
                payload: dData,
                data_hash: dataHash,
                order_count: n,
                courier_count: dData.couriers.length,
                updated_at: new Date()
            });
            logger.info(`💾 Division Cache Split: Saved ${n} orders for division ${dId} on ${targetDate}`);
        }
      } catch (e) {
        logger.error(`⚠️ Failed to save Excel to cache: ${e.message}`);
      }

      // Добавляем дополнительную информацию для предпросмотра
      const enhancedData = {
        ...result.data,
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size,
          uploadedAt: new Date().toISOString()
        },
        preview: {
          totalOrders: result.data.orders.length,
          totalCouriers: result.data.couriers.length,
          totalPaymentMethods: result.data.paymentMethods.length,
          totalAddresses: result.data.addresses.length,
          hasErrors: result.data.errors.length > 0,
          hasWarnings: result.data.warnings.length > 0,
          sampleOrders: result.data.orders.slice(0, 5), // Первые 5 заказов для предпросмотра
          uniqueCouriers: result.data.couriers.map(c => c.name),
          uniquePaymentMethods: result.data.paymentMethods.map(p => p.method),
          statistics: result.data.statistics
        }
      };

      res.json({
        success: true,
        data: enhancedData,
        summary: result.summary,
        message: 'Файл успешно обработан и готов к предпросмотру'
      });
    } else {
      logger.error(`Ошибка: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Ошибка обработки Excel файла', {
      error: error.message,
      stack: error.stack,
      fileName: req.file?.originalname
    });
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// Заглушки для обратной совместимости (будут удалены в будущем)
app.get('/api/health', (req, res) => res.json({ ok: true }))

// Курьеры
const courierRoutes = require('./src/routes/courierRoutes');
app.use('/api/couriers', courierRoutes);

// Courier Financial Tracking
const courierFinancialRoutes = require('./src/routes/courierFinancialRoutes');
app.use('/api/v1/couriers', courierFinancialRoutes);
app.use('/api/v1/settlements', courierFinancialRoutes);

// Маршруты
const routeRoutes = require('./src/routes/routeRoutes');
app.use('/api/routes', routeRoutes);

// Telegram маршруты
app.use('/api/telegram', telegramLimiter, telegramRoutes);

// Маршруты Fastopertor API
app.use('/api/fastopertor', fastopertorRoutes);

// Маршруты Dashboard API
app.use('/api/v1', dashboardRoutes);

// Маршруты заказов (overrides)
const orderRoutes = require('./src/routes/orderRoutes');
app.use('/api/v1/orders', orderRoutes);

// Маршруты авторизации
app.use('/api/auth/login', strictLimiter); // Protect login against brute-force
app.use('/api/auth', authRoutes);

// Управление пользователями (только для админов)
app.use('/api/users', userRoutes);

// Управление пресетами
app.use('/api/presets', presetRoutes);

// KML Прокси
const proxyRoutes = require('./src/routes/proxyRoutes');
app.use('/api/proxy', proxyRoutes);

// Техническое обслуживание (очистка БД)
const maintenanceRoutes = require('./src/routes/maintenanceRoutes');
app.use('/api/maintenance', maintenanceRoutes);

// Аудит логов (только для админов)
app.use('/api/logs', logRoutes);

// Геокеш и KML (Централизованное хранилище зон)
app.use('/api/geocache', geocacheRoutes);

// Эндпоинты Health check
app.get('/health/liveness', livenessProbe);
app.get('/health/readiness', readinessProbe(sequelize));
app.get('/health/startup', startupProbe(sequelize));

// Эндпоинт для метрик Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
});

app.post('/api/admin/setup', async (req, res) => {
  const { secret } = req.body;
  const SETUP_SECRET = process.env.SETUP_SECRET || 'setup-secret-123';

  if (secret !== SETUP_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  try {
    logger.info('[SETUP] Запуск ручной синхронизации БД и проверки админа...');
    await syncDatabase();

    const { User } = require('./src/models');
    const [admin, created] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        passwordHash: 'adminpassword123',
        role: 'admin',
        isActive: true,
        canModifySettings: true,
        divisionId: 'all'
      }
    });

    res.json({
      success: true,
      message: created ? 'Администратор создан' : 'Администратор уже существует',
      adminId: admin.id
    });
  } catch (error) {
    logger.error('[SETUP] Ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload/test-api-key', (req, res) => {
  const { apiKey } = req.body;
  res.json({
    success: true,
    data: {
      isValid: apiKey && apiKey.length >= 30,
      message: 'API ключ протестирован'
    }
  });
});

// Middleware обработки ошибок
app.use((err, req, res, next) => {
  const { ApiError } = require('./src/utils/errors');

  if (err instanceof ApiError) {
    logger.warn(`${err.name}: ${err.message}`, {
      statusCode: err.statusCode,
      details: err.details,
      path: req.path
    });
    return res.status(err.statusCode).json({
      success: false,
      error: err.name,
      message: err.message,
      details: err.details
    });
  }

  logger.error('Необработанная ошибка', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({
    success: false,
    error: 'InternalServerError',
    message: 'Внутренняя ошибка сервера'
  });
});


// Запуск сервера (Start listening IMMEDIATELY to pass liveness checks)
httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 [SERVER] Listening on 0.0.0.0:${PORT} (READY for health checks)`);
  
  // v35.1: Run heavy initialization in the background to avoid blocking Render deployment flow
  (async () => {
    logger.info('📦 [INIT] Starting background initialization...');
    try {
      await testConnection();
      
      const { User, UserPreset } = require('./src/models');
      let dbNeedsSync = false;

      try {
        await User.count();
        logger.info('✅ [INIT] Core tables verified');
      } catch (dbErr) {
        logger.warn('⚠️ [INIT] Core tables missing, sync required');
        dbNeedsSync = true;
      }

      if (process.env.NODE_ENV !== 'production' || process.env.DB_ALTER_SYNC === 'true' || dbNeedsSync) {
        logger.info(`🔄 [INIT] Starting syncDatabase (alter: ${process.env.DB_ALTER_SYNC || 'false'})`);
        await syncDatabase();
      }

      // v5.180: Production migration
      if (process.env.NODE_ENV === 'production') {
        try {
          await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "allowedTabs" JSON DEFAULT '["dashboard","routes","couriers","financials","analytics","telegram-parsing","settings"]'`);
          logger.info(`✅ [INIT] Migrations applied`);
        } catch (err) {
          logger.warn('⚠️ [INIT] Migration skipped or failed');
        }
      }

      // Admin Seed
      try {
        const seedUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
        const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'password2026';
        await User.findOrCreate({
          where: { username: seedUsername },
          defaults: {
            passwordHash: seedPassword,
            email: process.env.SEED_ADMIN_EMAIL || 'admin@kill-metraj.com',
            role: 'admin', isActive: true, canModifySettings: true, divisionId: 'all'
          }
        });
        logger.info(`✅ [INIT] Admin account verified: ${seedUsername}`);
      } catch (adminErr) {
        logger.error('❌ [INIT] Admin check failed', adminErr);
      }

      await setupDashboardListener();
      
      // Sequence of table checks
      const ensureTable = async (name, fn) => {
          try { await fn(); } catch (e) { logger.error(`❌ [INIT] Failed to ensure table ${name}`, e); }
      };

      await ensureTable('DashboardCache', ensureDashboardCacheTable);
      await ensureTable('StatusHistory', ensureStatusHistoryTable);
      await ensureTable('DivisionIdCol', ensureDivisionIdColumn);
      await ensureTable('ManualOverrides', ensureManualOverridesTable);
      await ensureTable('Routes', ensureRoutesTable);
      await ensureTable('Indexes', ensureIndexes);
      await ensureTable('KmlHubs', ensureKmlHubsTable);
      await ensureTable('KmlZones', ensureKmlZonesTable);
      await ensureTable('DashboardCacheV2', ensureDashboardCacheV2);

      // Workers
      try {
        turboCalculator = require('./workers/turboCalculator');
        if (turboCalculator) {
          turboCalculator.io = io;
          await turboCalculator.start(io);
          global.turboCalculator = turboCalculator;
          turboCalculatorReady = true; // v7.3: Mark as ready
          logger.info('🚀 [INIT] TurboCalculator worker started');
        }
      } catch (te) { 
        turboCalculatorReady = false;
        logger.error('❌ [INIT] TurboCalculator failed', te); 
      }

      try {
        const DashboardFetcher = require('./workers/dashboardFetcher');
        const fetcher = new DashboardFetcher();
        fetcher.start();
        logger.info('🚀 [INIT] DashboardFetcher started');
      } catch (fe) { logger.error('❌ [INIT] DashboardFetcher failed', fe); }

      try {
        grpcServer = startGrpcServer(process.env.GRPC_PORT || '50051');
        logger.info('🚀 [INIT] gRPC server started');
      } catch (ge) { logger.error('❌ [INIT] gRPC failed', ge); }

    logger.info('🏁 [INIT] Full system initialization complete');

    // Schedule daily TurboCalculator background calculation at midnight local time
    try {
      const scheduleDailyTurbo = () => {
        try {
          const now = new Date();
          const nextMidnight = new Date(now);
          nextMidnight.setHours(24, 0, 0, 0);
          const delay = nextMidnight.getTime() - now.getTime();
          setTimeout(async () => {
            try {
              if (turboCalculatorReady && global.turboCalculator) {
                const today = new Date().toISOString().split('T')[0];
                await global.turboCalculator.trigger(undefined, today, null, true);
                logger.info(`[Turbo] Daily background calc triggered for ${today}`);
              } else {
                logger.info('[Turbo] Daily background calc skipped: TurboCalculator not ready yet');
              }
            } catch (err) {
              logger.error('[Turbo] Daily background calc failed', err);
            } finally {
              // Schedule next run
              scheduleDailyTurbo();
            }
          }, delay);
        } catch (e) {
          logger.error('[Turbo] Scheduling daily calc failed', e);
        }
      };
      // Initialize the daily scheduler after startup
      scheduleDailyTurbo();
    } catch (err) {
      logger.error('⚠️ [INIT] Failed to initialize daily TurboCalculator scheduler', err);
    }

    } catch (globalInitErr) {
      logger.error('💥 [INIT] FATAL initialization error', globalInitErr);
    }
  })();
});

/**
 * Manual migration to ensure api_dashboard_cache table exists
 */
async function ensureDashboardCacheTable() {
  try {
    logger.info('DB Check: Ensuring api_dashboard_cache table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_dashboard_cache(
      id SERIAL PRIMARY KEY,
      payload JSONB NOT NULL,
      data_hash TEXT NOT NULL,
      status_code INTEGER DEFAULT 200,
      error_message TEXT,
      division_id TEXT,
      target_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
`);
    logger.info('DB Check: api_dashboard_cache table verified/created successfully');
  } catch (err) {
    logger.error('DB Check: Error creating api_dashboard_cache table', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * Manual migration to ensure table exists
 */
async function ensureStatusHistoryTable() {
  try {
    logger.info('DB Check: Ensuring api_dashboard_status_history table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_dashboard_status_history(
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`);
    logger.info('DB Check: api_dashboard_status_history table verified/created successfully');
  } catch (err) {
    logger.error('DB Check: Error creating api_dashboard_status_history table', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * Manual migration to ensure division_id column exists
 * This runs after sequelize.sync() as an extra safety measure for Render
 */
async function ensureDivisionIdColumn() {
  try {
    logger.info('DB Check: Ensuring division_id column exists...');
    await sequelize.query(`
      DO $$
BEGIN
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'api_dashboard_cache' AND column_name = 'division_id') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN division_id TEXT;
          RAISE NOTICE 'Added division_id column to api_dashboard_cache';
        END IF;
END
$$;
`);
    logger.info('DB Check: division_id column verified/added successfully');
  } catch (err) {
    logger.error('DB Check: Error adding division_id column', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * Manual migration to ensure manual_order_overrides table exists
 */
async function ensureManualOverridesTable() {
  try {
    logger.info('DB Check: Ensuring manual_order_overrides table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS manual_order_overrides(
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  field_name TEXT NOT NULL,
  override_value TEXT,
  original_value TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`);
    logger.info('DB Check: manual_order_overrides table verified/created successfully');
  } catch (err) {
    logger.error('DB Check: Error creating manual_order_overrides table', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * DB 2.0: Migrate api_dashboard_cache to V2 schema
 * - Add updated_at, order_count, courier_count, fetch_etag columns
 * - Add UNIQUE(division_id, target_date) constraint
 * - Deduplicate existing rows (keep newest per division/date)
 */
async function ensureDashboardCacheV2() {
  try {
    logger.info('DB Check: Migrating api_dashboard_cache to V2...');

    // 1. Add new columns if missing
    await sequelize.query(`
      DO $$
BEGIN
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'api_dashboard_cache' AND column_name = 'updated_at') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'api_dashboard_cache' AND column_name = 'order_count') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN order_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'api_dashboard_cache' AND column_name = 'courier_count') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN courier_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'api_dashboard_cache' AND column_name = 'fetch_etag') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN fetch_etag TEXT;
        END IF;
END
$$;
`);

    // 2. Deduplicate: keep only the newest row per division_id + target_date
    await sequelize.query(`
      DELETE FROM api_dashboard_cache a
      USING api_dashboard_cache b
      WHERE a.id < b.id
        AND a.division_id IS NOT DISTINCT FROM b.division_id
        AND a.target_date IS NOT DISTINCT FROM b.target_date;
`);

    // 3. Add unique constraint if missing
    await sequelize.query(`
      DO $$
BEGIN
        IF NOT EXISTS(
  SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_dashboard_cache_div_date'
) THEN
          ALTER TABLE api_dashboard_cache
            ADD CONSTRAINT uq_dashboard_cache_div_date UNIQUE(division_id, target_date);
        END IF;
END
$$;
`);

    // 4. Add composite index for fast lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_div_date
      ON api_dashboard_cache(division_id, target_date);
`);

    logger.info('DB Check: Dashboard cache V2 migration complete');
    
    // v33.6: Ensure function exists with current logic
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_dashboard_update()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.status_code = 200 THEN
              PERFORM pg_notify('dashboard_update', json_build_object(
                  'id', NEW.id,
                  'divisionId', NEW.division_id,
                  'targetDate', NEW.target_date,
                  'orderCount', NEW.order_count,
                  'created_at', NEW.created_at,
                  'status_code', NEW.status_code,
                  'data_hash', NEW.data_hash,
                  'source', 'db_trigger'
              )::text);
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS dashboard_update_trigger ON api_dashboard_cache;
      CREATE TRIGGER dashboard_update_trigger
      AFTER INSERT OR UPDATE ON api_dashboard_cache
      FOR EACH ROW
      EXECUTE FUNCTION notify_dashboard_update();
    `);
    logger.info('DB Check: Updated dashboard_update_trigger to AFTER INSERT OR UPDATE (v33.6)');
  } catch (err) {
    logger.error('DB Check: Error migrating dashboard cache to V2', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * Ensure database indexes exist for performance
 */
async function ensureIndexes() {
  try {
    logger.info('DB Check: Ensuring performance indexes...');

    // Index for history lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_status_history_order 
      ON api_dashboard_status_history(order_number);
`);

    // Index for fetcher lookups (division + date)
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_lookup 
      ON api_dashboard_cache(division_id, target_date);
`);

    // Index for deduplication hash
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_hash 
      ON api_dashboard_cache(data_hash);
`);

    logger.info('DB Check: Indexes verified/created successfully');
  } catch (err) {
    logger.error('DB Check: Error creating indexes', {
      error: err.message,
      stack: err.stack
    });
  }
}

/**
 * DB 2.1: Ensure KML Hubs table exists
 */
async function ensureKmlHubsTable() {
  try {
    logger.info('DB Check: Ensuring api_kml_hubs table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_kml_hubs(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source_url TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      last_sync_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
`);
    logger.info('DB Check: api_kml_hubs table verified/created');
  } catch (err) {
    logger.error('DB Check: Error creating api_kml_hubs table', { error: err.message });
  }
}

/**
 * DB 2.1: Ensure KML Zones table exists
 */
async function ensureKmlZonesTable() {
  try {
    logger.info('DB Check: Ensuring api_kml_zones table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_kml_zones(
      id SERIAL PRIMARY KEY,
      hub_id INTEGER NOT NULL REFERENCES api_kml_hubs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      boundary JSONB NOT NULL,
      bounds JSONB,
      is_technical BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
`);
    // Add index for hub_id
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_kml_zones_hub_id ON api_kml_zones(hub_id)');
    logger.info('DB Check: api_kml_zones table verified/created');
  } catch (err) {
    logger.error('DB Check: Error creating api_kml_zones table', { error: err.message });
  }
}

/**
 * v5.170: DB 2.2: Ensure calculated_routes table exists for Turbo Robot
 * This is CRITICAL — without this table, /api/routes/calculated returns 500
 */
async function ensureRoutesTable() {
  try {
    logger.info('DB Check: Ensuring calculated_routes table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS calculated_routes (
        id SERIAL PRIMARY KEY,
        courier_id VARCHAR(100) NOT NULL,
        division_id VARCHAR(50),
        total_distance DECIMAL(10,2) DEFAULT 0,
        total_duration INTEGER DEFAULT 0,
        engine_used VARCHAR(50) DEFAULT 'manual',
        is_active BOOLEAN DEFAULT TRUE,
        orders_count INTEGER DEFAULT 0,
        calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        route_data JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    // Add indexes for common queries
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_routes_division ON calculated_routes(division_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_routes_date ON calculated_routes((route_data->>\'target_date\'))');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_routes_courier ON calculated_routes(courier_id)');
    
    // v38.1: Fix unstable unique index — clear stale routes with old time_block format labels
    // Old format: "11:20 - 11:49" (unstable, changes every run if window expands)
    // New format: "2026-04-12_COURIER_NAME_1234567890000" (stable, deterministic)
    try {
      // Check if there are stale routes with old label-style time_block (contains " - ")
      const [staleCheck] = await sequelize.query(`
        SELECT COUNT(*) as cnt FROM calculated_routes 
        WHERE route_data->>'time_block' LIKE '% - %'
        LIMIT 1
      `);
      const staleCount = parseInt(staleCheck[0]?.cnt || '0');
      if (staleCount > 0) {
        await sequelize.query(`DELETE FROM calculated_routes WHERE route_data->>'time_block' LIKE '% - %'`);
        logger.info(`DB Check: Removed ${staleCount} stale routes with old-format time_block labels`);
      }
    } catch (staleErr) {
      logger.warn('DB Check: Could not clean stale routes:', staleErr.message);
    }

    logger.info('DB Check: calculated_routes table verified/created with indexes');
  } catch (err) {
    logger.error('DB Check: Error creating calculated_routes table', { error: err.message });
  }
}

async function setupDashboardListener() {
  try {
    const dbName = process.env.DB_NAME || 'kill_metraj';
    logger.info(`Настройка PostgreSQL LISTEN для базы данных: ${dbName} `);

    const connectionConfig = process.env.DATABASE_URL
      ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
      : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: dbName,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
      };

    pgListenClient = new Client(connectionConfig);

    await pgListenClient.connect();
    logger.info('Клиент PostgreSQL LISTEN успешно подключен');
    await pgListenClient.query('LISTEN dashboard_update');

    logger.info('Настройка PostgreSQL LISTEN завершена, ожидание событий "dashboard_update"');
    logger.info(`Ожидание обновлений дашборда в базе ${dbName} через PostgreSQL NOTIFY`);

    // Handle notifications
    pgListenClient.on('notification', async (msg) => {
      if (msg.channel === 'dashboard_update') {
        try {
          const notification = JSON.parse(msg.payload);
          const divisionId = notification.divisionId;
          logger.info('Получено уведомление об обновлении дашборда', { id: notification.id, divisionId });

          // v24.0: REMOVED automatic turboCalculator trigger from notifications
          // TurboCalculator now runs on its own schedule and via priority endpoint only
          // This prevents constant re-triggering and performance issues

          // v6.11: Notify TurboCalculator that fresh FO data arrived —
          // but ONLY activate divisions that user explicitly started (isActive=true)
          if (global.turboCalculator && typeof global.turboCalculator.notifyNewFOData === 'function') {
            const notifyDivId = String(notification.divisionId || '');
            const notifyDate = notification.targetDate || null;
            if (notifyDivId && notifyDivId !== 'all') {
              global.turboCalculator.notifyNewFOData(notifyDivId, notifyDate);
            }
          }

          // Сброс кэша при обновлении данных
          await cacheService.invalidateAll();
          logger.debug('Кэш сброшен из-за обновления данных');

          // Broadcast to all connected WebSocket clients with filtering
          const sockets = await io.fetchSockets();

          for (const socketInstance of sockets) {
            const socket = io.sockets.sockets.get(socketInstance.id);
            if (!socket || !socket.user) continue;

            const user = socket.user;

            // Optimization: Skip broadcast if it's for a different division and user is not admin
            if (user.role !== 'admin' && user.divisionId && String(user.divisionId) !== String(divisionId)) {
              continue;
            }

            // Fetch correctly filtered/merged data for this specific user
            const result = await GetDashboardDataQuery.execute({
              divisionId: user.role === 'admin' ? 'all' : user.divisionId,
              user
            });

            if (result) {
              socket.emit('dashboard:update', {
                data: result.payload,
                timestamp: result.created_at,
                status: result.status_code,
                source: 'server_initial',
                divisionId: divisionId
              });
            }
          }

          logger.info(`Обновление дашборда обработано для ${sockets.length} клиентов`);
        } catch (error) {
          logger.error('Error handling dashboard notification:', error);
        }
      }
    });

    // Обработка ошибок подключения
    pgListenClient.on('error', (err) => {
      logger.error('Ошибка клиента PostgreSQL LISTEN:', err);
    });

  } catch (error) {
    logger.error('Ошибка при настройке PostgreSQL LISTEN', { error: error.message });
    logger.warn('Обновления дашборда в реальном времени отключены');
  }
}

/**
 * Middleware авторизации Socket.io
 */
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Ошибка аутентификации: Токен обязателен'));
    }

    const { JWT_SECRET } = require('./src/middleware/auth');
    const jwt = require('jsonwebtoken');
    const { User } = require('./src/models');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user || !user.isActive) {
      return next(new Error('Ошибка аутентификации: Пользователь не найден или деактивирован'));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Ошибка аутентификации: Неверный токен'));
  }
});

/**
 * Обработка подключений Socket.io
 */
io.on('connection', (socket) => {
  const user = socket.user;
  logger.info(`Клиент подключен: ${socket.id} (Пользователь: ${user.username}, Подразделение: ${user.divisionId || 'ВСЕ'})`);

  // Отслеживание подключения WebSocket в метриках
  trackWebSocketConnection('connect', user.divisionId, user.role);

  // Send latest dashboard data on connection
  GetDashboardDataQuery.execute({
    divisionId: user.role === 'admin' ? 'all' : user.divisionId,
    user
  }).then(result => {
    if (result) {
      socket.emit('dashboard:update', {
        data: result.payload,
        timestamp: result.created_at,
        status: result.status_code,
        source: 'on_connect',
        divisionId: user.role === 'admin' ? 'all' : user.divisionId
      });
      logger.info(`Отправлены начальные данные дашборда клиенту ${socket.id} (заказов: ${result.payload.orders?.length || 0})`);
    }
  }).catch(error => {
    logger.error('Ошибка при отправке начальных данных дашборда:', error);
  });

  socket.on('disconnect', () => {
    logger.info(`Клиент отключен: ${socket.id} `);
    trackWebSocketConnection('disconnect', user.divisionId, user.role);
  });
});

/**
 * REST эндпоинт для получения последних данных дашборда
 */
const GetDashboardDataQuery = require('./src/queries/GetDashboardDataQuery');

app.get('/api/dashboard/latest', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { date } = req.query;
    const divisionId = user.role === 'admin' ? 'all' : user.divisionId;

    const result = await GetDashboardDataQuery.execute({ divisionId, user, date });

    if (!result) {
      return res.json({
        success: false,
        error: 'Данные дашборда пока недоступны'
      });
    }

    res.json({
      success: true,
      data: result.payload,
      timestamp: result.created_at,
      status: result.status_code || 200,
      cached: result.cached
    });
  } catch (error) {
    logger.error('Ошибка при получении данных дашборда:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить данные дашборда',
      details: process.env.NODE_ENV === 'production' ? null : error.message,
      db_error: error.message.includes('column') ? 'Database schema mismatch' : null
    });
  }
});

/**
 * v28.2: Get current background calculation statuses (global status store)
 */
app.get('/api/turbo/statuses', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: global.divisionStatusStore || {}
  });
});

// Turbo readiness endpoint
app.get('/api/turbo/ready', authenticateToken, (req, res) => {
  res.json({ success: true, ready: turboCalculatorReady && !!global.turboCalculator });
});

// Diagnostic: status today
app.get('/api/turbo/status_today', authenticateToken, (req, res) => {
  res.json({
    success: true,
    date: new Date().toISOString().split('T')[0],
    ready: turboCalculatorReady && !!global.turboCalculator,
    hasTodayCache: !!global.turboTodayCacheExists,
    lastCalcEpoch: global.turboTodayLastCalc
  });
});

// Priority trigger endpoint for turboCalculator
app.post('/api/turbo/priority', authenticateToken, async (req, res) => {
  try {
    // v37.1: Support both body and query params, and multiple date field names
    const user = req.user;
    let divisionId = req.body?.divisionId || req.query?.divisionId || user?.divisionId;
    const date = req.body?.date || req.query?.date || req.body?.targetDate || req.query?.targetDate;
    const userId = user?.id || req.body?.userId || req.query?.userId;
    const courierName = req.body?.courierName || req.query?.courierName; // v37.1: Optional target courier

    // v7.2: If divisionId is missing or empty from JWT, look it up from the DB
    if (!divisionId && userId) {
      try {
        logger.warn(`[API] divisionId missing from JWT for user ${userId} — looking up from DB`);
        const User = require('./src/models/User');
        const dbUser = await User.findByPk(userId, { attributes: ['divisionId'] });
        divisionId = dbUser?.divisionId;
        if (divisionId) {
          logger.info(`[API] Found divisionId=${divisionId} for user ${userId} from DB`);
        }
      } catch (dbErr) {
        logger.error('[API] Failed to lookup user divisionId from DB:', dbErr.message);
      }
    }

    if (!divisionId) {
      logger.warn('[API] divisionId could not be resolved for user', userId);
      return res.status(400).json({ success: false, error: 'divisionId is required. Please login again or set division in your profile.' });
    }
    logger.info(`[API] Priority trigger requested for division ${divisionId} by user ${userId}${courierName ? ` (Target: ${courierName})` : ''}`);

    // Save active division to DashboardState (per-user)
    const DashboardState = require('./src/models/DashboardState');
    const existing = await DashboardState.findOne({ where: { userId } });
    const existingData = (existing && existing.data) ? existing.data : {};
    await DashboardState.upsert({
      userId: userId,
      data: {
        ...existingData,
        activeDivisionId: String(divisionId),
        activeDivisionDate: date || new Date().toISOString().split('T')[0]
      },
      lastSavedAt: new Date()
    });

    logger.info(`[API] About to trigger turboCalculator with divisionId=${divisionId}, date=${date}, courier=${courierName || 'ALL'}`);
    
    // v7.4: Recovery — if worker failed to load at startup, try lazy-requiring it now
    if (!turboCalculator || !global.turboCalculator) {
      try {
        logger.warn('[API] turboCalculator is null, attempting emergency require recovery...');
        // v7.5: Clear require cache to ensure fresh load of fixed files
        try {
          delete require.cache[require.resolve('./workers/turboCalculator')];
          delete require.cache[require.resolve('./workers/turboGroupingHelpers')];
          delete require.cache[require.resolve('./workers/turboGeoEnhanced')];
        } catch (e) {}
        const recoveredWorker = require('./workers/turboCalculator');
        if (recoveredWorker) {
          recoveredWorker.io = io;
          await recoveredWorker.start(io);
          global.turboCalculator = recoveredWorker;
          turboCalculator = recoveredWorker;
          turboCalculatorReady = true;
          logger.info('[API] ✅ Emergency TurboCalculator recovery SUCCESS');
        }
      } catch (recoverErr) {
        logger.error('[API] ❌ Emergency TurboCalculator recovery FAILED:', recoverErr.message);
      }
    }

    const calculator = turboCalculator || global.turboCalculator;
    
    // v7.3: Allow manual triggers even during initialization if module is available
    if (!turboCalculatorReady && !calculator) {
      // Fallback: try to serve today's data from local cache if available
      try {
        const todayDate = (date) ? date : (new Date().toISOString().split('T')[0]);
        const isToday = todayDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          const { DashboardCache } = require('./src/models');
          const cached = await DashboardCache.findOne({ where: { division_id: divisionId, target_date: todayDate } });
          if (cached && cached.payload) {
            logger.info('[API] Serving local today data from DashboardCache (init fallback)');
            // v37.1: Return 200 with local:true so UI knows engine is warming up but data is here
            return res.json({ success: true, data: cached.payload, date: todayDate, local: true, status: 'initializing' });
          }
        }
      } catch (fallbackErr) {
        logger.warn('[API] Local today data fetch fallback failed:', fallbackErr.message);
      }
      
      logger.error('[API] turboCalculator not available (initialization_in_progress)');
      return res.status(503).json({ 
        success: false, 
        error: 'TurboCalculator is initializing, please retry in 10-15 seconds',
        is_ready: false 
      });
    }
    
    if (calculator && typeof calculator.trigger === 'function') {
      try {
        // v5.172: Manual trigger = FULL recalculation (forceFull=true)
        // v37.1: Pass courierName to trigger
        calculator.trigger(divisionId, date, userId, true, courierName);
        logger.info(`[API] turboCalculator.trigger() called with forceFull=true, courier=${courierName || 'ALL'}`);
        res.json({ 
            success: true, 
            message: courierName ? `Recalculation started for ${courierName}` : `Priority calculation started for division ${divisionId}`, 
            divisionId, 
            date: date || new Date().toISOString().split('T')[0],
            courier: courierName
        });
      } catch (triggerErr) {
        logger.error('[API] turboCalculator.trigger() threw error:', triggerErr);
        res.status(500).json({ success: false, error: 'Trigger failed: ' + triggerErr.message });
      }
    } else {
      const why = !calculator ? 'null_instance' : (typeof calculator.trigger !== 'function' ? 'missing_trigger_fn' : 'unknown');
      logger.error(`[API] turboCalculator not available (reason: ${why}, is null: ${calculator === null}, type: ${typeof calculator})`);
      res.status(500).json({ 
        success: false, 
        error: 'TurboCalculator not available', 
        details: why,
        is_global_set: !!global.turboCalculator 
      });
    }
  } catch (error) {
    logger.error('[API] Error triggering priority calculation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to trigger priority calculation', 
      details: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
});

// v24.0: Stop background calculation
app.post('/api/turbo/stop', authenticateToken, async (req, res) => {
  try {
    const { divisionId } = req.body;
    // Stop a specific division if provided, else stop all
    if (divisionId) {
      if (turboCalculator && typeof turboCalculator.stop === 'function') {
        await turboCalculator.stop(divisionId);
      }
      return res.json({ success: true, message: `Background calculation stopped for division ${divisionId}` });
    }
    // global stop
    if (turboCalculator && typeof turboCalculator.stop === 'function') {
      await turboCalculator.stop();
      return res.json({ success: true, message: 'Background calculation stopped' });
    }
    res.status(500).json({ success: false, error: 'TurboCalculator not available' });
  } catch (error) {
    logger.error('[API] Error stopping calculation:', error);
    res.status(500).json({ success: false, error: 'Failed to stop calculation' });
  }
});

// v5.190: Clear background calculation distances for division
app.post('/api/turbo/clear', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let divisionId = req.body?.divisionId || user?.divisionId;
    const date = req.body?.date || new Date().toISOString().split('T')[0];

    if (!divisionId) {
      return res.status(400).json({ success: false, error: 'divisionId is required.' });
    }

    const { Route } = require('./src/models');
    if (Route) {
      const deleted = await Route.destroy({
        where: {
          division_id: divisionId,
          [require('sequelize').Op.and]: require('sequelize').where(
            require('sequelize').literal("route_data->>'target_date'"),
            date
          )
        }
      });
      logger.info(`[API] Cleared ${deleted} routes for division ${divisionId} on ${date}`);
      
      if (turboCalculator && turboCalculator.processedHashes) {
         turboCalculator.processedHashes.delete(`${divisionId}_${date}`);
         if (turboCalculator.divisionStates.has(String(divisionId))) {
             turboCalculator.divisionStates.get(String(divisionId)).courierStats = {};
         }
      }
      
      // Let UI know routes to refresh
      io.emit('routes_update', {
          divisionId: divisionId,
          date: date,
          routes: []
      });
      
      return res.json({ success: true, message: `Данные очищены! Удалено маршрутов: ${deleted}` });
    }


    res.status(500).json({ success: false, error: 'Route DB init skipped' });
  } catch (error) {
    logger.error('[API] Error clearing calculations:', error);
    res.status(500).json({ success: false, error: 'Failed to clear calculations' });
  }
});

// v38.2: Delete stale routes with old label-format time_block (e.g. "11:20 - 11:49")
// These prevent ON CONFLICT from working correctly — must be cleared once before new format takes effect
app.post('/api/turbo/reset-stale-routes', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    if (user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    // Delete ALL routes whose time_block contains " - " (old label format)
    const [result] = await sequelize.query(
      `DELETE FROM calculated_routes WHERE route_data->>'time_block' LIKE '% - %' RETURNING id`
    );
    const count = Array.isArray(result) ? result.length : 0;
    logger.info(`[API] 🗑️ Reset stale routes: deleted ${count} old-format routes`);

    // Also emit a routes_update so UI refreshes
    const divisionId = req.body?.divisionId || 'all';
    io.emit('routes_update', { divisionId, routes: [], cleared: true });

    res.json({ success: true, deletedCount: count, message: `Удалено ${count} устаревших маршрутов. Запустите Рассчитать для обновления.` });
  } catch (error) {
    logger.error('[API] Error resetting stale routes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * Hub for TurboCalculator events to maintain global state
 */
io.on('connection', (socket) => {
  // socket connection logic exists below
});

/**
 * Debug endpoint to check fetcher status
 */
app.get('/api/debug/fetcher', authenticateToken, async (req, res) => {
  try {
    const stats = {};

    // 1. Check database schema
    const columns = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'api_dashboard_cache'",
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.schema = {
      table_exists: columns.length > 0,
      columns: columns.map(c => c.column_name),
      has_division_id: columns.some(c => c.column_name === 'division_id')
    };

    // 2. Check latest data
    const results = await sequelize.query(
      'SELECT id, division_id, target_date, created_at, status_code FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 5',
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.latest_records = results;
    stats.fetcher_status = results.length > 0 ? 'running' : 'no_data';

    // 3. Test external API connectivity (Ping)
    if (process.env.EXTERNAL_API_URL) {
      try {
        const axios = require('axios');
        const start = Date.now();
        // Use a short timeout for the connectivity test
        await axios.head(process.env.EXTERNAL_API_URL, { timeout: 3000 });
        stats.external_api = {
          status: 'reachable',
          latency: `${Date.now() - start} ms`,
          url: process.env.EXTERNAL_API_URL.split('?')[0]
        };
      } catch (err) {
        stats.external_api = {
          status: 'unreachable',
          error: err.message,
          url: process.env.EXTERNAL_API_URL?.split('?')[0]
        };
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      turbo_calculator_status: turboCalculator ? {
        isRunning: turboCalculator.isRunning,
        isProcessing: turboCalculator.isProcessing,
        activeDivisions: Array.from(turboCalculator.divisionStates?.entries() || [])
      } : 'not_initialized',
      orders_summary: await sequelize.query(
        "SELECT division_id, target_date, jsonb_array_length(payload->'orders') as order_count FROM api_dashboard_cache WHERE target_date = '2026-03-30' LIMIT 10",
        { type: sequelize.QueryTypes.SELECT }
      )
    });
  } catch (error) {
    logger.error('Debug endpoint failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * Завершение работы сервера
 */
const shutdown = async () => {
  logger.info('Завершение работы сервера...');
  await dashboardConsumer.stop();
  if (grpcServer) {
    grpcServer.forceShutdown();
    logger.info('gRPC сервер остановлен');
  }
  if (pgListenClient) {
    await pgListenClient.end();
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
