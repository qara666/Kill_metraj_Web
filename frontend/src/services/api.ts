// API сервисы для работы с данными
// Заглушки для совместимости с существующим кодом

export const analyticsApi = {
  getDashboardAnalytics: async () => {
    // Заглушка для аналитики
    return {
      totalOrders: 0,
      totalRevenue: 0,
      totalCouriers: 0,
      totalRoutes: 0,
      activeRoutes: 0,
      activeCouriers: 0,
      averageOrdersPerRoute: 0,
      completionRate: 0,
      completedRoutes: 0
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
      const response = await fetch('http://localhost:10000/api/upload/excel', {
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
      console.error('Ошибка загрузки файла на сервер:', error)
      
      // Backend недоступен - возвращаем ошибку
      throw new Error('Не удалось подключиться к серверу. Проверьте, что backend запущен на Render.')
    }
  }
}
