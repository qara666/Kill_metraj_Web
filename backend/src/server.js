const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
// Middleware
const allowedHeaders = [
  'Content-Type',
  'Authorization',
  'x-api-key',
  'X-API-KEY',
  'X-Requested-With',
  'Accept',
  'Origin'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins (true) with credentials
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: allowedHeaders,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Manual OPTIONS handler for extra robustness with custom headers
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).send();
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

    console.log('Получен файл:', req.file.originalname, 'размер:', req.file.size);

    // Обрабатываем файл через ExcelService
    const result = await excelService.processExcelFile(req.file.buffer);

    if (!result.success) {
      return res.status(400).json({
        error: 'Ошибка обработки файла',
        details: result.message,
        data: result.data
      });
    }

    console.log('Файл обработан успешно:', {
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
    console.error('Ошибка обработки файла:', error);
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Simple Excel Server',
    status: 'running',
    endpoints: ['/api/upload/excel', '/api/swagger/orders', '/health']
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
