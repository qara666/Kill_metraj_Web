import { API_URL } from '../config/apiConfig'

export const analyticsApi = {
  getDashboardAnalytics: async () => ({
    totalOrders: 0,
    totalRevenue: 0,
    totalCouriers: 0,
    totalRoutes: 0
  })
}

export const courierApi = {
  getCouriers: async () => []
}

export const routeApi = {
  getRoutes: async () => []
}

export const uploadApi = {
  uploadExcelFile: async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/api/upload/excel`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Ошибка обработки файла')
      }

      return result
    } catch (error) {
      console.error('Ошибка загрузки файла на сервер:', error)

      return {
        success: false,
        message: `Не удалось подключиться к серверу: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        data: {
          orders: [],
          couriers: [],
          paymentMethods: [],
          routes: [],
          errors: [{
            row: 0,
            message: `Ошибка подключения к серверу: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
            data: null
          }],
          summary: {
            totalRows: 0,
            successfulGeocoding: 0,
            failedGeocoding: 0,
            orders: 0,
            couriers: 0,
            paymentMethods: 0,
            errors: [{
              row: 0,
              message: `Ошибка подключения к серверу: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
              data: null
            }]
          }
        }
      }
    }
  }
}
