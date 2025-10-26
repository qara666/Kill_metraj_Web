// API сервисы для работы с данными
// Заглушки для совместимости с существующим кодом

import ExcelService from './ExcelService';

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
      const response = await fetch('https://killmetraj-backend.onrender.com/api/upload/excel', {
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
      console.error('Ошибка загрузки файла на сервер, используем fallback обработку:', error)
      
      // Fallback: обработка Excel файла во frontend
      try {
        const excelService = new ExcelService()
        const result = await excelService.processExcelFile(file)
        
        if (result.success && result.data) {
          console.log('Excel файл успешно обработан во frontend:', {
            orders: result.data.orders.length,
            couriers: result.data.couriers.length,
            errors: result.data.errors.length
          })
          
          return {
            success: true,
            data: result.data,
            summary: result.summary,
            message: 'Файл успешно обработан во frontend (fallback режим)'
          }
        } else {
          throw new Error(result.error || 'Неизвестная ошибка обработки')
        }
      } catch (fallbackError) {
        console.error('Ошибка fallback обработки:', fallbackError)
        
        // Последний fallback - пустые данные
        const emptyData = {
          orders: [],
          couriers: [],
          paymentMethods: [],
          routes: [],
          errors: [(fallbackError as Error).message],
          warnings: [],
          statistics: {},
          summary: {
            totalRows: 0,
            successfulGeocoding: 0,
            failedGeocoding: 1,
            orders: 0,
            couriers: 0,
            paymentMethods: 0,
            errors: [(fallbackError as Error).message]
          },
          debug: {
            logs: [
              '⚠️ Backend сервер недоступен',
              '⚠️ Fallback обработка не удалась',
              'Проверьте формат Excel файла и попробуйте снова'
            ]
          }
        }
        
        return {
          success: false,
          message: 'Не удалось обработать Excel файл. Проверьте формат файла.',
          data: emptyData
        }
      }
    }
  }
}
