const express = require('express');
const multer = require('multer');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const ExcelService = require('./src/services/ExcelService_v3');
const telegramRoutes = require('./src/routes/telegramRoutes');
const fastopertorRoutes = require('./src/routes/fastopertorRoutes');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const presetRoutes = require('./src/routes/presetRoutes');
const logRoutes = require('./src/routes/logRoutes');
const logger = require('./src/utils/logger');
const { generalLimiter, uploadLimiter, telegramLimiter } = require('./src/middleware/rateLimiter');
const { sequelize, testConnection } = require('./src/config/database');
const { syncDatabase } = require('./src/models');

const app = express();
const PORT = process.env.PORT || 5001;

// Manual Robust CORS Middleware (Wildcard Origin)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-API-KEY, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

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

// ExcelService
const excelService = new ExcelService();

// Legacy logs array for backward compatibility
const logs = [];
const addLog = (message) => {
  const timestamp = new Date().toISOString();
  logs.push(`[${timestamp}] ${message}`);
  logger.info(message);
};

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
    message: 'Telegram routes are working',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/upload/excel', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    addLog('Начало обработки Excel файла');

    if (!req.file) {
      addLog('Ошибка: файл не предоставлен');
      return res.status(400).json({
        success: false,
        error: 'Файл не предоставлен'
      });
    }

    addLog(`Получен файл: ${req.file.originalname}, размер: ${req.file.size} байт`);

    const result = await excelService.processExcelFile(req.file.buffer);

    addLog(`Результат: успех=${result.success}, заказов=${result.data?.orders?.length || 0}`);

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
      addLog(`Ошибка: ${result.error}`);
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

// Minimal placeholder routes for frontend api.ts expectations
app.get('/api/health', (req, res) => res.json({ ok: true }))

// Couriers
app.get('/api/couriers', (_req, res) => res.json({ success: true, data: [] }))
app.get('/api/couriers/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id } }))
app.get('/api/couriers/:id/statistics', (_req, res) => res.json({ success: true, data: { id: _req.params.id, stats: {} } }))
app.post('/api/couriers', (_req, res) => res.json({ success: true, data: { ..._req.body, id: 'new' } }))
app.put('/api/couriers/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id, ..._req.body } }))
app.delete('/api/couriers/:id', (_req, res) => res.json({ success: true }))

// Routes
app.get('/api/routes', (_req, res) => res.json({ success: true, data: [] }))
app.get('/api/routes/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id } }))
app.get('/api/routes/statistics', (_req, res) => res.json({ success: true, data: {} }))
app.post('/api/routes', (_req, res) => res.json({ success: true, data: { ..._req.body, id: 'route_new' } }))
app.post('/api/routes/from-waypoints', (_req, res) => res.json({ success: true, data: { id: 'route_from_waypoints', input: _req.body } }))
app.put('/api/routes/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id, ..._req.body } }))
app.put('/api/routes/:id/complete', (_req, res) => res.json({ success: true, data: { id: _req.params.id, status: 'completed' } }))
app.put('/api/routes/:id/archive', (_req, res) => res.json({ success: true, data: { id: _req.params.id, archived: true } }))
app.delete('/api/routes/:id', (_req, res) => res.json({ success: true }))

// Upload
app.post('/api/upload/create-routes', (_req, res) => res.json({ success: true, data: { created: true, input: _req.body } }))
app.get('/api/upload/sample-template', (_req, res) => {
  const sample = 'orderNumber,address,plannedTime,amount,courier\n123,Улица Пушкина 1,10:30,500,Иванов';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sample-template.csv"');
  res.send(sample);
})
app.post('/api/upload/batch-geocode', (_req, res) => {
  const addresses = Array.isArray(_req.body?.addresses) ? _req.body.addresses : [];
  const results = addresses.map((addr, idx) => ({ address: addr, lat: 59.9 + idx * 0.001, lng: 30.3 + idx * 0.001 }));
  res.json({ success: true, data: { results } });
})

// Analytics
app.get('/api/analytics/dashboard', (_req, res) => res.json({ success: true, data: {} }))
app.get('/api/analytics/courier-performance', (_req, res) => res.json({ success: true, data: [] }))
app.get('/api/analytics/route-analytics', (_req, res) => res.json({ success: true, data: {} }))

// Telegram routes with rate limiting
app.use('/api/telegram', telegramLimiter, telegramRoutes);

// Fastopertor API routes
app.use('/api/fastopertor', fastopertorRoutes);

// Dashboard API routes (mirrors real API v1)
app.use('/api/v1', dashboardRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);

// User management routes (admin only)
app.use('/api/users', userRoutes);

// Preset management routes
app.use('/api/presets', presetRoutes);

// Audit log routes (admin only)
app.use('/api/logs', logRoutes);

app.get('/debug/logs', (req, res) => {
  res.json({
    logs: logs,
    count: logs.length,
    timestamp: new Date().toISOString()
  });
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

// Error handling middleware
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

  logger.error('Unhandled error', {
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



// Запуск с инициализацией БД
async function startServer() {
  try {
    // Подключение к PostgreSQL
    await testConnection();
    logger.info('✅ PostgreSQL connected');

    // Синхронизация моделей с БД
    await syncDatabase();

    // Запуск сервера
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Сервер запущен на 0.0.0.0:${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development'
      });
      console.log(`\n✅ Сервер работает на http://localhost:${PORT}`);
      console.log(`📊 Dashboard API: http://localhost:${PORT}/api/v1`);
      console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`👥 Users API: http://localhost:${PORT}/api/users`);
      console.log(`📡 Telegram API: http://localhost:${PORT}/api/telegram`);
      console.log(`🔧 Debug logs: http://localhost:${PORT}/debug/logs\n`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
