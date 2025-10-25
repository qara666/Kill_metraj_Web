const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const ExcelService = require('./services/ExcelService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Создаем экземпляр ExcelService
const excelService = new ExcelService();

// Глобальные логи для отладки
global.debugLogs = [];
global.addDebugLog = (message) => {
  const timestamp = new Date().toISOString();
  global.debugLogs.push(`[${timestamp}] ${message}`);
  console.log(`[DEBUG] ${message}`);
  // Ограничиваем количество логов
  if (global.debugLogs.length > 100) {
    global.debugLogs = global.debugLogs.slice(-50);
  }
};

// Маршруты
app.get('/', (req, res) => {
  res.json({ 
    message: 'Kill Metraj Backend API (No DB Mode)',
    status: 'running',
    version: '1.0.0',
    mode: 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'no-db'
  });
});

// Загрузка и обработка Excel файлов
app.post('/api/upload/excel', upload.single('file'), async (req, res) => {
  try {
    global.addDebugLog('Начало обработки Excel файла');
    
    if (!req.file) {
      global.addDebugLog('Ошибка: файл не предоставлен');
      return res.status(400).json({
        success: false,
        error: 'Файл не предоставлен'
      });
    }

    global.addDebugLog(`Получен файл: ${req.file.originalname}, размер: ${req.file.size} байт`);

    // Обрабатываем Excel файл
    const result = await excelService.processExcelFile(req.file.buffer);
    
    global.addDebugLog(`Результат обработки: успех=${result.success}, заказов=${result.data?.orders?.length || 0}`);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        summary: result.summary,
        message: 'Файл успешно обработан'
      });
    } else {
      global.addDebugLog(`Ошибка обработки: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    global.addDebugLog(`Критическая ошибка: ${error.message}`);
    console.error('Ошибка обработки файла:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// Тестирование API ключа
app.post('/api/upload/test-api-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API ключ не предоставлен'
      });
    }

    // Простая валидация API ключа
    const isValid = apiKey.length >= 30 && /^[A-Za-z0-9_-]+$/.test(apiKey);
    
    res.json({
      success: true,
      data: {
        isValid: isValid,
        message: isValid ? 'API ключ валиден' : 'API ключ невалиден'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка тестирования API ключа'
    });
  }
});

// Получение логов отладки
app.get('/debug/logs', (req, res) => {
  res.json({
    message: 'Последние логи обработки Excel файлов',
    logs: global.debugLogs || [],
    count: (global.debugLogs || []).length,
    timestamp: new Date().toISOString()
  });
});

// Очистка логов
app.post('/debug/logs/clear', (req, res) => {
  global.debugLogs = [];
  res.json({
    message: 'Логи очищены',
    timestamp: new Date().toISOString()
  });
});

// Тестирование заголовков
app.get('/debug/test-headers', (req, res) => {
  try {
    const testHeaders = ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'];
    const headerMap = excelService.mapHeaders(testHeaders);
    
    res.json({
      success: true,
      data: {
        inputHeaders: testHeaders,
        mappedHeaders: headerMap,
        hasAddress: headerMap.address !== undefined
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Тестирование обработки данных
app.get('/debug/test-processing', async (req, res) => {
  try {
    const testData = [
      ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'],
      ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500'],
      ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750']
    ];
    
    const result = await excelService.processSheetData(testData, 'Test');
    
    res.json({
      success: true,
      data: {
        inputData: testData,
        result: result,
        ordersCount: result.orders.length,
        couriersCount: result.couriers.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Получение шаблона
app.get('/api/upload/sample-template', (req, res) => {
  try {
    const XLSX = require('xlsx');
    
    const sampleData = [
      ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма', 'Телефон', 'Имя клиента'],
      ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500', '+380501234567', 'Петр Иванов'],
      ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750', '+380509876543', 'Анна Петрова'],
      ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300', '+380501112233', 'Сергей Козлов']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sample_orders.xlsx');
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка создания шаблона'
    });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера'
  });
});

// 404 обработчик
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Маршрут не найден'
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT} (режим без БД)`);
  console.log(`📊 API доступно по адресу: http://localhost:${PORT}`);
  console.log(`🔍 Отладочные логи: http://localhost:${PORT}/debug/logs`);
  global.addDebugLog('Сервер запущен в режиме без БД');
});

module.exports = app;




