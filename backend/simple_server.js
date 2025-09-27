const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ExcelService = require('./src/services/ExcelService_v2');

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Настройка multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ExcelService
const excelService = new ExcelService();

// Логи
const logs = [];
const addLog = (message) => {
  const timestamp = new Date().toISOString();
  logs.push(`[${timestamp}] ${message}`);
  console.log(`[LOG] ${message}`);
};

// Маршруты
app.get('/', (req, res) => {
  res.json({ message: 'Simple Excel Server', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/upload/excel', upload.single('file'), async (req, res) => {
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
      res.json({
        success: true,
        data: result.data,
        summary: result.summary,
        message: 'Файл успешно обработан'
      });
    } else {
      addLog(`Ошибка: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    addLog(`Критическая ошибка: ${error.message}`);
    console.error('Ошибка:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

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

// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Простой сервер запущен на порту ${PORT}`);
  addLog('Сервер запущен');
});
