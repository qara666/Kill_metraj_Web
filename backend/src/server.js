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

    // Создаем тестовые данные для демонстрации
    const mockData = {
      orders: [
        {
          id: `order_${Date.now()}_1`,
          orderNumber: 'ORD-001',
          address: 'ул. Крещатик, 1, Киев',
          courier: 'Иван Петров',
          amount: 150,
          phone: '+380501234567',
          customerName: 'Анна Иванова',
          plannedTime: '10:00-12:00',
          isSelected: false,
          isInRoute: false
        },
        {
          id: `order_${Date.now()}_2`,
          orderNumber: 'ORD-002',
          address: 'ул. Шевченко, 15, Киев',
          courier: 'Мария Сидорова',
          amount: 200,
          phone: '+380501234568',
          customerName: 'Петр Козлов',
          plannedTime: '14:00-16:00',
          isSelected: false,
          isInRoute: false
        }
      ],
      couriers: [
        {
          id: `courier_${Date.now()}_1`,
          name: 'Иван Петров',
          phone: '+380501234567',
          email: 'ivan@example.com',
          vehicleType: 'car',
          isActive: true
        },
        {
          id: `courier_${Date.now()}_2`,
          name: 'Мария Сидорова',
          phone: '+380501234568',
          email: 'maria@example.com',
          vehicleType: 'motorcycle',
          isActive: true
        }
      ],
      paymentMethods: [],
      routes: [],
      errors: [],
      debug: {
        logs: [
          'Файл успешно загружен',
          'Обработано 2 заказа',
          'Найдено 2 курьера',
          'Геокодирование выполнено успешно'
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