// Тест для проверки функции кодирования данных
// Этот файл можно удалить после тестирования

const testData = {
  excelData: {
    orders: [
      {
        id: 'test_1',
        orderNumber: 'ORD-001',
        address: 'ул. Тестовая, 1, Киев',
        courier: 'Тест Курьер',
        amount: 100,
        phone: '+380501234567',
        customerName: 'Тест Клиент',
        plannedTime: '10:00-12:00'
      }
    ],
    couriers: [
      {
        id: 'courier_1',
        name: 'Тест Курьер',
        phone: '+380501234567',
        email: 'test@example.com',
        vehicleType: 'car',
        isActive: true
      }
    ]
  },
  routes: [],
  timestamp: Date.now(),
  version: '1.0.0'
}

// Тестируем функцию sanitizeData
console.log('Тестируем sanitizeData...')
const sanitized = dataSharingUtils.sanitizeData(testData)
console.log('Данные очищены:', sanitized)

// Тестируем функцию encodeData
console.log('Тестируем encodeData...')
try {
  const encoded = dataSharingUtils.encodeData(testData)
  console.log('Данные закодированы успешно, длина:', encoded.length)
  
  // Тестируем функцию decodeData
  console.log('Тестируем decodeData...')
  const decoded = dataSharingUtils.decodeData(encoded)
  console.log('Данные декодированы успешно:', decoded)
} catch (error) {
  console.error('Ошибка при тестировании:', error)
}
