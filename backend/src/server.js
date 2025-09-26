const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const courierRoutes = require('./routes/courierRoutes');
const routeRoutes = require('./routes/routeRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Load environment variables
dotenv.config({ path: './backend/.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Массив для хранения логов
const debugLogs = [];
const MAX_LOGS = 100;

// Функция для добавления логов
function addDebugLog(message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    data
  };
  debugLogs.push(logEntry);
  
  // Ограничиваем количество логов
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }
  
  // Также выводим в консоль
  console.log(`[DEBUG] ${message}`, data || '');
}

// Экспортируем функцию для добавления логов (безопасная версия)
global.addDebugLog = addDebugLog;

// Connect to MongoDB
const connectDB = async () => {
  try {
    let mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kill_metraj';
    
    // If using MongoDB Atlas, ensure proper connection string format
    if (mongoURI.includes('mongodb+srv://')) {
      // Add retryWrites and w parameters for better reliability
      if (!mongoURI.includes('retryWrites')) {
        mongoURI += '?retryWrites=true&w=majority';
      }
    }
    
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 URI:', mongoURI.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('ENOTFOUND')) {
      console.error('💡 Tip: Check your MongoDB connection string and network connectivity');
    } else if (error.message.includes('authentication failed')) {
      console.error('💡 Tip: Check your MongoDB username and password');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Tip: Check your MongoDB cluster status and network connection');
    }
    
    process.exit(1);
  }
};

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Debug endpoint для просмотра логов
app.get('/debug/logs', (req, res) => {
  res.status(200).json({
    message: 'Последние логи обработки Excel файлов',
    logs: debugLogs,
    count: debugLogs.length,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint для очистки логов
app.post('/debug/logs/clear', (req, res) => {
  debugLogs.length = 0;
  res.status(200).json({
    message: 'Логи очищены',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint для проверки распознавания заголовков
app.get('/debug/test-headers', (req, res) => {
  const ExcelService = require('./services/ExcelService');
  const excelService = new ExcelService();
  
  // Тестовые заголовки
  const testHeaders = [
    '№',           // 0
    'Адрес',       // 1  
    'Телефон',     // 2
    'имя',         // 3
    'Тип заказа',  // 4
    'Способ оплаты', // 5
    'Курьер',      // 6
    'Сумма заказа' // 7
  ];
  
  const headerMap = excelService.mapHeaders(testHeaders);
  
  res.status(200).json({
    message: 'Тест распознавания заголовков',
    testHeaders,
    headerMap,
    hasAddress: headerMap.address !== undefined,
    hasOrderNumber: headerMap.orderNumber !== undefined,
    canCreateOrders: headerMap.address !== undefined,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint для проверки обработки тестовых данных
app.get('/debug/test-processing', (req, res) => {
  const ExcelService = require('./services/ExcelService');
  const excelService = new ExcelService();
  
  // Тестовые данные
  const testData = [
    ['№', 'Адрес', 'Телефон', 'имя', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма заказа'],
    ['1', 'ул. Пушкина 1', '+380501234567', 'Иван', 'Доставка', 'Наличные', 'Курьер1', '100'],
    ['2', 'ул. Ленина 2', '+380507654321', 'Петр', 'Самовывоз', 'Карта', 'Курьер2', '200'],
    ['', '', '', '', '', '', 'Курьер3', ''], // Пустая строка
    ['3', '', '+380509876543', 'Сидор', 'Доставка', 'Наличные', '', '300'] // Без адреса
  ];
  
  // Очищаем логи
  debugLogs.length = 0;
  
  // Обрабатываем данные
  excelService.processSheetData(testData, 'test')
    .then(result => {
      res.status(200).json({
        message: 'Тест обработки данных',
        result,
        debugLogs: debugLogs.slice(-20), // Последние 20 логов
        timestamp: new Date().toISOString()
      });
    })
    .catch(error => {
      res.status(500).json({
        message: 'Ошибка тестирования',
        error: error.message,
        debugLogs: debugLogs.slice(-20),
        timestamp: new Date().toISOString()
      });
    });
});

// Root endpoint - helpful landing instead of 404
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Kill_metraj API',
    message: 'Backend is running',
    endpoints: {
      health: '/health',
      api: '/api',
      couriers: '/api/couriers',
      routes: '/api/routes',
      upload: '/api/upload',
      analytics: '/api/analytics'
    }
  });
});

// API root helper
app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Kill_metraj API root',
    endpoints: {
      couriers: '/api/couriers',
      routes: '/api/routes',
      upload: '/api/upload',
      analytics: '/api/analytics'
    }
  });
});

// API routes
app.use('/api/couriers', courierRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('📦 MongoDB connection closed.');
    process.exit(0);
  });
});

startServer();
