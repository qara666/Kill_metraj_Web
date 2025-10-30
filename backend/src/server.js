const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
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
app.post('/api/upload/excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден' });
    }

    console.log('Получен файл:', req.file.originalname);

    // Возвращаем пустые данные
    const mockData = {
      orders: [],
      couriers: [],
      paymentMethods: [],
      routes: [],
      errors: [],
      debug: {
        logs: [
          'Файл успешно загружен',
          'Обработано 0 заказов',
          'Найдено 0 курьеров'
        ]
      }
    };

    res.json({
      success: true,
      message: 'Файл успешно обработан',
      data: mockData
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Simple Excel Server', 
    status: 'running',
    endpoints: ['/api/upload/excel', '/health']
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

























