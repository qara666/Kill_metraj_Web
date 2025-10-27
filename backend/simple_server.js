const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ExcelService = require('./src/services/ExcelService_v3');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://kill-metraj-frontend.onrender.com',
    'https://kill-metraj-web.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
    addLog(`Критическая ошибка: ${error.message}`);
    console.error('Ошибка:', error);
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Простой сервер запущен на 0.0.0.0:${PORT}`);
  addLog('Сервер запущен');
});











