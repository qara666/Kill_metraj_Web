const express = require('express');
const multer = require('multer');
const path = require('path');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
// Middleware
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

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Простая обработка Excel файлов
const ExcelService = require('./services/ExcelService');
const excelService = new ExcelService();

app.post('/api/upload/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    logger.info('Получен файл для обработки', { fileName: req.file.originalname, size: req.file.size });

    // Обрабатываем файл через ExcelService
    const result = await excelService.processExcelFile(req.file.buffer);

    if (!result.success) {
      return res.status(400).json({
        error: 'Ошибка обработки файла',
        details: result.message,
        data: result.data
      });
    }

    logger.info('Файл обработан успешно', {
      orders: result.data.orders.length,
      couriers: result.data.couriers.length,
      paymentMethods: result.data.paymentMethods.length
    });

    res.json({
      success: true,
      message: result.message,
      data: result.data
    });

  } catch (error) {
    logger.error('Ошибка обработки файла', { error: error.message });
    res.status(500).json({
      error: 'Ошибка обработки файла',
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Swagger API routes
const swaggerRoutes = require('./routes/swaggerRoutes');
app.use('/api/swagger', swaggerRoutes);

// Geocache (L2 Persistent Store)
const geocacheRoutes = require('./routes/geocacheRoutes');
app.use('/api/geocache', geocacheRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Simple Excel Server',
    status: 'running',
    endpoints: ['/api/upload/excel', '/api/swagger/orders', '/health']
  });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Сервер (legacy) запущен на порту ${PORT}`);
});
