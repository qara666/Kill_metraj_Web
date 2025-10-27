import { processExcelFile } from '../utils/excelProcessor'

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
      const processedData = await processExcelFile(file)
      return {
        success: true,
        message: 'Файл успешно обработан',
        data: processedData
      }
    } catch (error) {
      const mockData = {
        orders: [{
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
        }],
        couriers: [{
          id: `courier_${Date.now()}_1`,
          name: 'Иван Петров',
          phone: '+380501234567',
          email: 'ivan@example.com',
          vehicleType: 'car',
          isActive: true
        }],
        paymentMethods: [],
        routes: [],
        errors: [{
          row: 0,
          message: `Ошибка обработки файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          data: null
        }],
        summary: {
          totalRows: 0,
          successfulGeocoding: 0,
          failedGeocoding: 0,
          orders: 1,
          couriers: 1,
          paymentMethods: 0,
          errors: [{
            row: 0,
            message: `Ошибка обработки файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
            data: null
          }]
        }
      }
      
      return {
        success: false,
        message: `Ошибка обработки файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        data: mockData
      }
    }
  }
}
