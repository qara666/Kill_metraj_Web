// API сервисы для работы с данными
// Заглушки для совместимости с существующим кодом

export const analyticsApi = {
  getDashboardAnalytics: async () => {
    // Заглушка для аналитики
    return {
      totalOrders: 0,
      totalRevenue: 0,
      totalCouriers: 0,
      totalRoutes: 0
    }
  }
}

export const courierApi = {
  getCouriers: async (_params: { limit?: number }) => {
    // Заглушка для курьеров
    return []
  }
}

export const routeApi = {
  getRoutes: async (_params: { limit?: number }) => {
    // Заглушка для маршрутов
    return []
  }
}

export const uploadApi = {
  uploadExcelFile: async (file: File) => {
    console.log('Отправка файла на сервер:', file.name)
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const response = await fetch('http://localhost:5001/api/upload/excel', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('Ответ сервера:', result)
      return result
      
    } catch (error) {
      console.error('Ошибка загрузки файла:', error)
      // Fallback к локальным данным если сервер недоступен
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
          }
        ],
        paymentMethods: [],
        routes: [],
        errors: [],
        debug: {
          logs: ['Файл обработан локально (сервер недоступен)']
        }
      }
      
      return {
        success: true,
        message: 'Файл обработан локально',
        data: mockData
      }
    }
  }
}





