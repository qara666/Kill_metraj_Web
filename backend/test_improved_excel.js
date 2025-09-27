const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const ExcelServiceImproved = require('./src/services/ExcelService_improved');

const app = express();
const PORT = 5002; // Другой порт для тестирования

// Middleware
app.use(cors());
app.use(express.json());

// Настройка multer для загрузки файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/octet-stream' // fallback для Excel файлов
    ];
    
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      console.log(`Отклонен файл: ${file.originalname}, MIME: ${file.mimetype}, расширение: ${fileExtension}`);
      cb(new Error('Неподдерживаемый тип файла. Разрешены только Excel (.xlsx, .xls) и CSV файлы.'), false);
    }
  }
});

const excelService = new ExcelServiceImproved();

// Маршруты
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Улучшенный Excel сервер работает',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/upload/excel', upload.single('file'), async (req, res) => {
  try {
    console.log('📁 Получен файл для обработки');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не предоставлен'
      });
    }

    console.log(`📊 Файл: ${req.file.originalname}, размер: ${req.file.size} байт`);
    
    const result = await excelService.processExcelFile(req.file.buffer);
    
    console.log('✅ Обработка завершена:', {
      success: result.success,
      orders: result.data?.orders?.length || 0,
      errors: result.data?.errors?.length || 0,
      warnings: result.data?.warnings?.length || 0
    });

    res.json(result);
    
  } catch (error) {
    console.error('❌ Ошибка обработки файла:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Маршрут для получения отладочной информации
app.get('/api/debug/logs', (req, res) => {
  res.json({
    message: 'Отладочные логи улучшенного Excel сервиса',
    logs: excelService.debugLogs,
    count: excelService.debugLogs.length,
    timestamp: new Date().toISOString()
  });
});

// Маршрут для очистки логов
app.post('/api/debug/logs/clear', (req, res) => {
  excelService.debugLogs = [];
  res.json({
    message: 'Логи очищены',
    timestamp: new Date().toISOString()
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Улучшенный Excel сервер запущен на порту ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Логи: http://localhost:${PORT}/api/debug/logs`);
});
