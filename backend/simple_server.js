const express = require('express');
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
const logger = require('./src/utils/logger');
// Константы и настройки загрузки файлов
const { generalLimiter, uploadLimiter, telegramLimiter } = require('./src/middleware/rateLimiter');
const { sequelize, testConnection } = require('./src/config/database');
const { syncDatabase, AuditLog } = require('./src/models');
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
      // Allow local development
      if (!origin || origin.startsWith('http://localhost') || origin === FRONTEND_URL) {
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

// Клиент PostgreSQL LISTEN (отдельно от Sequelize)
let pgListenClient = null;
const dashboardConsumer = new DashboardConsumer(io);
let grpcServer = null;

// Global error handlers for better debugging on Render
process.on('uncaughtException', (err) => {
  logger.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное исключение (Uncaught Exception)', { error: err.message, stack: err.stack });
  // Give some time for logs to flush before exiting
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('КРИТИЧЕСКАЯ ОШИБКА: Необработанное отклонение промиса (Unhandled Rejection)', { reason: reason?.message || reason, stack: reason?.stack });
});

const cors = require('cors');

// CRITICAL: Trust proxy for Render/Cloudflare load balancer
// This fixes: "ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false"
// Render's load balancer adds X-Forwarded-For headers, and we need to trust them for:
// - express-rate-limit to correctly identify client IPs
// - req.ip to return the real client IP instead of the proxy IP
// - Security and logging purposes
app.set('trust proxy', 1);

// CORS configuration for Render and local development
const corsOptions = {
  origin: (origin, callback) => {
    // Allow local development
    if (!origin || origin.startsWith('http://localhost') || origin === FRONTEND_URL) {
      return callback(null, true);
    }
    // Allow any Render subdomain
    if (origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    // Log disallowed origins to help debugging
    logger.warn('[CORS] Источник запрещен Express:', { origin });
    callback(null, false); // Don't throw error, just don't allow
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-API-KEY', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400
};

// Custom Middleware to handle CORS Preflight explicitly
// This runs BEFORE the main CORS middleware to guarantee 204 response
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const isAllowed =
      !origin ||
      origin.startsWith('http://localhost') ||
      origin === FRONTEND_URL ||
      origin.endsWith('.onrender.com');

    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-API-KEY, X-Requested-With, Accept, Origin');
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

// Add imports at top
// ... (existing code)

// ... (existing code)

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
httpServer.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Сервер запущен на 0.0.0.0:${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });

  // Background Initialization
  try {
    await testConnection();
    logger.info('PostgreSQL подключен');

    // Skip sync in production unless explicitly requested via DB_ALTER_SYNC
    if (process.env.NODE_ENV !== 'production' || process.env.DB_ALTER_SYNC === 'true') {
      await syncDatabase();
    } else {
      logger.info('SUCCESS: Database sync skipped (production mode)');
    }

    logger.info('STARTING ADMIN CHECK/CREATION...');
    const { User, UserPreset } = require('./src/models');
    try {
      // Use environment variables or fallback to defaults
      const seedUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
      const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'adminpassword123';
      const seedEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';

      const [admin, created] = await User.findOrCreate({
        where: { username: seedUsername },
        defaults: {
          passwordHash: seedPassword, // Will be hashed via hook
          email: seedEmail,
          role: 'admin',
          isActive: true,
          canModifySettings: true,
          divisionId: 'all'
        }
      });

      if (created) {
        logger.info(`УСПЕХ: Аккаунт администратора "${seedUsername}" создан автоматически.`);

        // Create default preset for new admin
        try {
          await UserPreset.create({
            userId: admin.id,
            settings: { theme: 'dark', cityBias: 'Kyiv, Ukraine' },
            updatedBy: admin.id
          });
          logger.info('УСПЕХ: Профиль настроек (UserPreset) для администратора создан.');
        } catch (presetErr) {
          logger.error('ПРЕДУПРЕЖДЕНИЕ: Не удалось создать UserPreset для администратора', { error: presetErr.message });
        }
      } else {
        logger.info(`ИНФО: Аккаунт администратора "${seedUsername}" уже существует.`);

        // Ensure admin has correct role and division
        let needsUpdate = false;
        if (admin.role !== 'admin') { admin.role = 'admin'; needsUpdate = true; }
        if (admin.divisionId !== 'all') { admin.divisionId = 'all'; needsUpdate = true; }

        if (needsUpdate) {
          await admin.save();
          logger.info('ИНФО: Права и подразделение администратора обновлены.');
        }

        // Check if preset exists for existing admin
        const existingPreset = await UserPreset.findOne({ where: { userId: admin.id } });
        if (!existingPreset) {
          await UserPreset.create({
            userId: admin.id,
            settings: { theme: 'dark', cityBias: 'Kyiv, Ukraine' },
            updatedBy: admin.id
          });
          logger.info('ИНФО: Отсутствующий UserPreset для администратора был создан.');
        }
      }
    } catch (createErr) {
      logger.error('КРИТИЧЕСКАЯ ОШИБКА: Не удалось проверить/создать администратора', { error: createErr.message });
    }

    // Diagnostics for adm_mak
    try {
      const diagUser = await User.findOne({ where: { username: 'adm_mak' } });
      if (diagUser) {
        if (diagUser.role !== 'user') {
          diagUser.role = 'user';
          await diagUser.save();
          logger.info('Пользователь adm_mak понижен до роли user');
        }
        logger.info(`Диагностика пользователя [adm_mak]: role=${diagUser.role}, divisionId=${diagUser.divisionId}, isActive=${diagUser.isActive}`);
      } else {
        logger.warn('Диагностика пользователя [adm_mak]: НЕ НАЙДЕН');
      }
    } catch (diagErr) {
      logger.error('Ошибка диагностики пользователя:', diagErr.message);
    }



    await setupDashboardListener();

    // Start manual migration check
    await ensureStatusHistoryTable();
    await ensureDivisionIdColumn();
    await ensureManualOverridesTable();
    await ensureDashboardCacheV2();
    await ensureIndexes();

    // Start Kafka CDC Consumer if enabled
    if (process.env.CDC_ENABLED === 'true') {
      try {
        await dashboardConsumer.start();
      } catch (cdcError) {
        logger.error('Не удалось запустить Dashboard CDC Consumer', cdcError);
      }
    }

    // Start Dashboard Fetcher worker within the main process
    try {
      const DashboardFetcher = require('./workers/dashboardFetcher');
      const fetcher = new DashboardFetcher();
      fetcher.start();
      logger.info('Загрузчик дашборда запущен внутри основного процесса');
    } catch (fetcherError) {
      logger.error('Не удалось запустить загрузчик дашборда', fetcherError);
    }

  } catch (dbError) {
    logger.error('КРИТИЧЕСКАЯ ОШИБКА: Ошибка инициализации базы данных, сервер продолжает работу для отображения логов', { error: dbError.message });
  }

  try {
    grpcServer = startGrpcServer(process.env.GRPC_PORT || '50051');
  } catch (grpcError) {
    logger.error('Не удалось запустить gRPC сервер', grpcError);
  }
});

/**
 * Manual migration to ensure table exists
 */
async function ensureStatusHistoryTable() {
  try {
    logger.info('DB Check: Ensuring api_dashboard_status_history table exists...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS api_dashboard_status_history (
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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='api_dashboard_cache' AND column_name='division_id') THEN
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
      CREATE TABLE IF NOT EXISTS manual_order_overrides (
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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_dashboard_cache' AND column_name='updated_at') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_dashboard_cache' AND column_name='order_count') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN order_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_dashboard_cache' AND column_name='courier_count') THEN
          ALTER TABLE api_dashboard_cache ADD COLUMN courier_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_dashboard_cache' AND column_name='fetch_etag') THEN
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
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'uq_dashboard_cache_div_date'
        ) THEN
          ALTER TABLE api_dashboard_cache
            ADD CONSTRAINT uq_dashboard_cache_div_date UNIQUE (division_id, target_date);
        END IF;
      END
      $$;
    `);

    // 4. Add composite index for fast lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_div_date
      ON api_dashboard_cache (division_id, target_date);
    `);

    logger.info('DB Check: Dashboard cache V2 migration complete');
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
      ON api_dashboard_status_history (order_number);
    `);

    // Index for fetcher lookups (division + date)
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_lookup 
      ON api_dashboard_cache (division_id, target_date);
    `);

    // Index for deduplication hash
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_dashboard_cache_hash 
      ON api_dashboard_cache (data_hash);
    `);

    logger.info('DB Check: Indexes verified/created successfully');
  } catch (err) {
    logger.error('DB Check: Error creating indexes', {
      error: err.message,
      stack: err.stack
    });
  }
}

async function setupDashboardListener() {
  try {
    const dbName = process.env.DB_NAME || 'kill_metraj';
    logger.info(`Настройка PostgreSQL LISTEN для базы данных: ${dbName}`);

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
                status: result.status_code
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
        status: result.status_code
      });
      logger.info(`Отправлены начальные данные дашборда клиенту ${socket.id} (заказов: ${result.payload.orders?.length || 0})`);
    }
  }).catch(error => {
    logger.error('Ошибка при отправке начальных данных дашборда:', error);
  });

  socket.on('disconnect', () => {
    logger.info(`Клиент отключен: ${socket.id}`);
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
          latency: `${Date.now() - start}ms`,
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
      stats
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


