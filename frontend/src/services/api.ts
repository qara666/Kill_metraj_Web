import axios from 'axios';
import type { 
  Courier, 
  Route, 
  ProcessedOrder, 
  ExcelProcessingResult,
  ApiResponse,
  DashboardStats,
  CourierPerformance,
  RouteAnalytics,
  CreateCourierForm,
  CreateRouteForm
} from '../types';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      console.error('Unauthorized access');
    }
    return Promise.reject(error);
  }
);

// Courier API
export const courierApi = {
  // Get all couriers
  getCouriers: async (params?: {
    active?: boolean;
    vehicleType?: string;
    location?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Courier[]>> => {
    const response = await api.get('/couriers', { params });
    return response.data;
  },

  // Get courier by ID
  getCourierById: async (id: string): Promise<ApiResponse<Courier>> => {
    const response = await api.get(`/couriers/${id}`);
    return response.data;
  },

  // Get courier statistics
  getCourierStatistics: async (id: string): Promise<ApiResponse<any>> => {
    const response = await api.get(`/couriers/${id}/statistics`);
    return response.data;
  },

  // Create courier
  createCourier: async (data: CreateCourierForm): Promise<ApiResponse<Courier>> => {
    const response = await api.post('/couriers', data);
    return response.data;
  },

  // Update courier
  updateCourier: async (id: string, data: Partial<CreateCourierForm>): Promise<ApiResponse<Courier>> => {
    const response = await api.put(`/couriers/${id}`, data);
    return response.data;
  },

  // Delete courier
  deleteCourier: async (id: string): Promise<ApiResponse<any>> => {
    const response = await api.delete(`/couriers/${id}`);
    return response.data;
  },
};

// Route API
export const routeApi = {
  // Get all routes
  getRoutes: async (params?: {
    courierId?: string;
    isActive?: boolean;
    isCompleted?: boolean;
    priority?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Route[]>> => {
    const response = await api.get('/routes', { params });
    return response.data;
  },

  // Get route by ID
  getRouteById: async (id: string): Promise<ApiResponse<Route>> => {
    const response = await api.get(`/routes/${id}`);
    return response.data;
  },

  // Get route statistics
  getRouteStatistics: async (): Promise<ApiResponse<any>> => {
    const response = await api.get('/routes/statistics');
    return response.data;
  },

  // Create route
  createRoute: async (data: CreateRouteForm): Promise<ApiResponse<Route>> => {
    const response = await api.post('/routes', data);
    return response.data;
  },

  // Create route from waypoints
  createRouteFromWaypoints: async (data: {
    waypoints: ProcessedOrder[];
    courierId?: string;
    startAddress?: string;
    endAddress?: string;
  }): Promise<ApiResponse<Route>> => {
    const response = await api.post('/routes/from-waypoints', data);
    return response.data;
  },

  // Update route
  updateRoute: async (id: string, data: Partial<CreateRouteForm>): Promise<ApiResponse<Route>> => {
    const response = await api.put(`/routes/${id}`, data);
    return response.data;
  },

  // Complete route
  completeRoute: async (id: string): Promise<ApiResponse<Route>> => {
    const response = await api.put(`/routes/${id}/complete`);
    return response.data;
  },

  // Archive route
  archiveRoute: async (id: string): Promise<ApiResponse<Route>> => {
    const response = await api.put(`/routes/${id}/archive`);
    return response.data;
  },

  // Delete route
  deleteRoute: async (id: string): Promise<ApiResponse<any>> => {
    const response = await api.delete(`/routes/${id}`);
    return response.data;
  },
};

// Upload API
export const uploadApi = {
  // Upload Excel file
  uploadExcelFile: async (file: File): Promise<ApiResponse<ExcelProcessingResult>> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload/excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Create routes from orders
  createRoutesFromOrders: async (data: {
    orders: ProcessedOrder[];
    courierAssignments?: Record<string, string>;
  }): Promise<ApiResponse<any>> => {
    const response = await api.post('/upload/create-routes', data);
    return response.data;
  },

  // Get sample template
  getSampleTemplate: async (): Promise<Blob> => {
    const response = await api.get('/upload/sample-template', {
      responseType: 'blob',
    });
    return response.data;
  },

  // Test API key
  testApiKey: async (apiKey: string): Promise<ApiResponse<{ isValid: boolean; message: string }>> => {
    const response = await api.post('/upload/test-api-key', { apiKey });
    return response.data;
  },

  // Batch geocode addresses
  batchGeocodeAddresses: async (data: {
    addresses: string[];
    delayMs?: number;
  }): Promise<ApiResponse<any>> => {
    const response = await api.post('/upload/batch-geocode', data);
    return response.data;
  },
};

// Analytics API
export const analyticsApi = {
  // Get dashboard analytics
  getDashboardAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<DashboardStats>> => {
    const response = await api.get('/analytics/dashboard', { params });
    return response.data;
  },

  // Get courier performance analytics
  getCourierPerformance: async (params?: {
    startDate?: string;
    endDate?: string;
    courierId?: string;
  }): Promise<ApiResponse<CourierPerformance[]>> => {
    const response = await api.get('/analytics/courier-performance', { params });
    return response.data;
  },

  // Get route analytics
  getRouteAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
    courierId?: string;
  }): Promise<ApiResponse<RouteAnalytics>> => {
    const response = await api.get('/analytics/route-analytics', { params });
    return response.data;
  },
};

// Health check
export const healthCheck = async (): Promise<ApiResponse<any>> => {
  const response = await api.get('/health');
  return response.data;
};

// Export default api instance for custom requests
export default api;
