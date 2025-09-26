// Common types used throughout the application

export interface Address {
  scannedText: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
  isDestination: boolean;
  isWaypoint?: boolean;
  orderIndex?: number;
  orderNumber?: string;
}

export interface Courier {
  _id: string;
  name: string;
  phoneNumber?: string;
  isActive: boolean;
  vehicleType: 'car' | 'motorcycle';
  location: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  routes: string[];
  
  // Statistics
  totalOrders: number;
  totalDistance: number;
  totalDistanceWithAdditional: number;
  averageOrdersPerRoute: number;
  efficiencyScore: number;
  routeCount?: number;
  activeRoutes?: number;
  completedRoutes?: number;
}

export interface Route {
  _id: string;
  startPoint: Address;
  endPoint: Address;
  waypoints: Address[];
  totalDistance: string;
  totalDuration: string;
  polyline: string;
  transportationMode?: string;
  courier?: Courier | string;
  
  // Route management
  isActive: boolean;
  isCompleted: boolean;
  isArchived: boolean;
  completionDate?: string;
  notes: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimatedFuelCost: number;
  actualFuelCost: number;
  routeRating: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  createdAt: string;
  updatedAt: string;
  
  // Virtual fields
  waypointCount?: number;
  orderCount?: number;
}

export interface ProcessedOrder {
  courierName: string;
  orderNumber: string;
  originalAddress: string;
  geocodedAddress?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  geocodingSuccess: boolean;
  error?: string;
  placeId?: string;
  types?: string[];
}

export interface ExcelProcessingResult {
  orders: ProcessedOrder[];
  summary: {
    totalOrders: number;
    successfulGeocoding: number;
    failedGeocoding: number;
    couriers: string[];
    errors: string[];
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  // Optional fields some endpoints return (e.g., upload controller)
  summary?: any;
  message?: string;
  report?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DashboardStats {
  overview: {
    totalRoutes: number;
    activeRoutes: number;
    completedRoutes: number;
    archivedRoutes: number;
    totalCouriers: number;
    activeCouriers: number;
    archivedCouriers: number;
    totalOrders: number;
    totalDistance: number;
    averageOrdersPerRoute: number;
    averageDistancePerRoute: number;
    completionRate: number;
  };
  courierPerformance: Array<{
    id: string;
    name: string;
    vehicleType: string;
    location: string;
    totalRoutes: number;
    totalOrders: number;
    totalDistance: number;
    completionRate: number;
    efficiencyScore: number;
  }>;
  distributions: {
    priority: {
      low: number;
      normal: number;
      high: number;
      urgent: number;
    };
    difficulty: {
      easy: number;
      medium: number;
      hard: number;
      expert: number;
    };
    vehicleType: {
      car: number;
      motorcycle: number;
    };
  };
}

export interface CourierPerformance {
  courier: {
    id: string;
    name: string;
    vehicleType: string;
    location: string;
  };
  metrics: {
    totalRoutes: number;
    completedRoutes: number;
    totalOrders: number;
    totalDistance: number;
    completionRate: number;
    averageOrdersPerRoute: number;
    averageDistancePerRoute: number;
    efficiencyScore: number;
    ordersPerKm: number;
  };
}

export interface RouteAnalytics {
  overview: {
    totalRoutes: number;
    totalOrders: number;
    totalDistance: number;
    averageOrdersPerRoute: number;
    averageDistancePerRoute: number;
  };
  distributions: {
    status: {
      active: number;
      completed: number;
      archived: number;
    };
    priority: {
      low: number;
      normal: number;
      high: number;
      urgent: number;
    };
    difficulty: {
      easy: number;
      medium: number;
      hard: number;
      expert: number;
    };
  };
  topRoutes: Array<{
    id: string;
    courier: string;
    waypointCount: number;
    distance: number;
    efficiency: number;
    priority: string;
    difficulty: string;
    isCompleted: boolean;
  }>;
}

// Form types
export interface CreateCourierForm {
  name: string;
  phoneNumber?: string;
  vehicleType: 'car' | 'motorcycle';
  location: string;
}

export interface CreateRouteForm {
  startAddress: string;
  endAddress: string;
  waypoints: ProcessedOrder[];
  courierId?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  notes?: string;
}

export interface SettingsForm {
  googleMapsApiKey: string;
  defaultStartAddress: string;
  defaultEndAddress: string;
  geocodingDelay: number;
  validateUkraine: boolean;
}

// Filter types
export interface CourierFilters {
  active?: boolean;
  vehicleType?: string;
  location?: string;
  search?: string;
}

export interface RouteFilters {
  courierId?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  priority?: string;
  search?: string;
}

// Chart data types
export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  label?: string;
}
