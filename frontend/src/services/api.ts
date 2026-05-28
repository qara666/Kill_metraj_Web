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

export const uploadApi = {}
