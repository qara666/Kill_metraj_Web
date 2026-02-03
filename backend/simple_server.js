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
      // Allow Render subdomains
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  // Оптимизация для Render: предотвращаем частые разрывы "transport close"
  pingTimeout: 60000,
  pingInterval: 25000
});

// Клиент PostgreSQL LISTEN (отдельно от Sequelize)
let pgListenClient = null;
const dashboardConsumer = new DashboardConsumer(io);
let grpcServer = null;

// Manual Robust CORS Middleware (Dynamic)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = !origin ||
    origin.startsWith('http://localhost') ||
    origin === FRONTEND_URL ||
    origin.endsWith('.onrender.com');

  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-API-KEY, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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

    const result = await excelService.processExcelFile(req.file.buffer);

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

// Маршруты
const routeRoutes = require('./src/routes/routeRoutes');
app.use('/api/routes', routeRoutes);

// Telegram маршруты
app.use('/api/telegram', telegramLimiter, telegramRoutes);

// Маршруты Fastopertor API
app.use('/api/fastopertor', fastopertorRoutes);

// Маршруты Dashboard API
app.use('/api/v1', dashboardRoutes);

// Маршруты авторизации
app.use('/api/auth', authRoutes);

// Управление пользователями (только для админов)
app.use('/api/users', userRoutes);

// Управление пресетами
app.use('/api/presets', presetRoutes);

// KML Прокси
const proxyRoutes = require('./src/routes/proxyRoutes');
app.use('/api/proxy', proxyRoutes);

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
const server = http.createServer(app); // Use the existing 'app' variable
// Note: We already created httpServer in line 29: const httpServer = http.createServer(app);
// So we should use httpServer.

httpServer.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Сервер запущен на 0.0.0.0:${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });

  // Attempt DB connection in background
  try {
    await testConnection();
    logger.info('PostgreSQL подключен');
    await syncDatabase();

    // ... (User creation logic) ...
    const { User } = require('./src/models');
    // ...
    const [admin, created] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        passwordHash: 'adminpassword123',
        role: 'admin',
        isActive: true,
        canModifySettings: true,
        divisionId: '100000000'
      }
    }).catch(err => logger.error('Failed to create admin:', err.message));
    // ...

    // Initialize other services that need DB
    await setupDashboardListener();

    if (process.env.CDC_ENABLED === 'true') {
      await dashboardConsumer.start();
    }

  } catch (dbError) {
    logger.error('CRITICAL: Database initialization failed, but keeping server alive for logs', { error: dbError.message });
    // Do not exit. Admin can see logs.
  }

  // Start gRPC server
  try {
    grpcServer = startGrpcServer(process.env.GRPC_PORT || '50051');
  } catch (grpcError) {
    logger.error('Failed to start gRPC server', grpcError);
  }

  // Start DashboardFetcher (internal)
  // ...
});

async function setupDashboardListener() {
  try {
    const dbName = process.env.DB_NAME || 'kill_metraj';
    logger.info(`Настройка PostgreSQL LISTEN для базы данных: ${dbName}`);

    pgListenClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: dbName,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    });

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
          logger.info('Получено уведомление об обновлении дашборда', { id: notification.id });

          // Сброс кэша при обновлении данных
          await cacheService.invalidateAll();
          logger.debug('Кэш сброшен из-за обновления данных');

          // Fetch full data from database
          const [results] = await sequelize.query(
            'SELECT * FROM api_dashboard_cache WHERE id = $1',
            {
              bind: [notification.id],
              type: sequelize.QueryTypes.SELECT
            }
          );

          if (results) {
            // Broadcast to all connected WebSocket clients with filtering
            const sockets = await io.fetchSockets();

            for (const socketInstance of sockets) {
              const socket = io.sockets.sockets.get(socketInstance.id);
              if (!socket || !socket.user) continue;

              const user = socket.user;
              let payload = results.payload;

              // Filter by divisionId
              if (user.role !== 'admin' && user.divisionId) {
                payload = {
                  ...payload,
                  orders: (payload.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
                  couriers: (payload.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
                };
              }

              socket.emit('dashboard:update', {
                data: payload,
                timestamp: results.created_at,
                status: results.status_code
              });
            }

            logger.info(`Обновление дашборда разослано ${sockets.length} клиентам с фильтрацией`);
          }
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
  sequelize.query(
    'SELECT * FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1',
    { type: sequelize.QueryTypes.SELECT }
  ).then(results => {
    if (results.length > 0) {
      let payload = results[0].payload;

      // Filter orders by divisionId if user is not admin and has divisionId
      if (user.role !== 'admin' && user.divisionId) {
        payload = {
          ...payload,
          orders: (payload.orders || []).filter(o => String(o.departmentId) === String(user.divisionId)),
          couriers: (payload.couriers || []).filter(c => String(c.departmentId) === String(user.divisionId))
        };
      }

      socket.emit('dashboard:update', {
        data: payload,
        timestamp: results[0].created_at,
        status: results[0].status_code
      });
      logger.info(`Отправлены отфильтрованные данные дашборда клиенту ${socket.id} (заказов: ${payload.orders?.length || 0})`);
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
      error: 'Не удалось получить данные дашборда'
    });
  }
});

startServer();

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
