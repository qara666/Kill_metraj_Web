// Common types used throughout the application

export interface Coordinates {
  lat: number;
  lng: number;
}

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

export interface Order {
  idx?: number
  address: string
  raw?: any
  orderNumber?: string | number
  readyAt?: number | null
  readyAtSource?: number | null // Время на кухню без упаковки (приоритет над readyAt)
  deadlineAt?: number | null
  coords?: Coordinates | null
  deliveryZone?: string
  status?: string // 'В работе', 'Собран', 'Доставляется', 'Исполнен'
  handoverAt?: number | null // Время перехода в статус 'Доставляется' (Phase 4.4)
  manualGroupId?: string | null // Ручное назначение группы (Phase 4.7)
  statusTimings?: {
    assembledAt?: number;
    deliveringAt?: number;
    completedAt?: number;
  };
  isSelected?: boolean
  isInRoute?: boolean
  [key: string]: any
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
  id?: string; // Client-side ID
  startPoint?: Address;
  endPoint?: Address;
  startAddress?: string;
  endAddress?: string;
  waypoints?: Address[];
  routeChain?: string[];
  routeChainFull?: Order[];
  totalDistance: string | number;
  totalDuration: string | number;
  totalDistanceKm?: string | number;
  totalDurationMin?: string | number;
  polyline?: string;
  transportationMode?: string;
  courier?: Courier | string;
  stopsCount?: number;

  // Route management
  isActive: boolean;
  isCompleted: boolean;
  isArchived: boolean;
  completionDate?: string;
  notes?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedFuelCost?: number;
  actualFuelCost?: number;
  routeRating?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  createdAt?: string;
  updatedAt?: string;

  // Analytics/Optimization specific
  routeEfficiency?: number;
  totalTrafficDelay?: number;
  hasCriticalTraffic?: boolean;
}

export interface ProcessedOrder {
  courierName: string;
  orderNumber: string;
  originalAddress: string;
  geocodedAddress?: string;
  coordinates?: Coordinates;
  geocodingSuccess: boolean;
  error?: string;
  placeId?: string;
  types?: string[];
}

export interface ProcessedExcelData {
  orders: Order[];
  couriers: any[];
  paymentMethods: any[];
  routes: any[];
  errors: any[];
  summary: {
    totalRows: number;
    successfulGeocoding: number;
    failedGeocoding: number;
    orders: number;
    couriers: number;
    paymentMethods: number;
    errors: any[];
  };
}

export interface RoutePlanningSettings {
  orderPriority: 'deliveryTime' | 'distance' | 'zone' | 'none'
  prioritizeUrgent: boolean
  urgentThresholdMinutes: number
  loadBalancing: 'equal' | 'byZone' | 'byDistance' | 'none'
  maxOrdersPerCourier: number | null
  minOrdersPerRoute: number
  groupingStrategy: 'proximity' | 'zone' | 'timeWindow' | 'paymentMethod' | 'none'
  proximityGroupingRadius: number
  timeWindowGroupingMinutes: number
  optimizationGoal: 'distance' | 'time' | 'balance' | 'turns'
  avoidTraffic: boolean
  preferMainRoads: boolean
  minRouteEfficiency: number
  allowRouteSplitting: boolean
  preferSingleZoneRoutes: boolean
  maxReadyTimeDifferenceMinutes: number
  maxDistanceBetweenOrdersKm: number | null
  enableOrderCombining: boolean
  combineMaxDistanceMeters: number
  combineMaxTimeWindowMinutes: number
  trafficImpactLevel: 'low' | 'medium' | 'high'
  lateDeliveryPenalty: number
}

export interface TrafficPresetInfo {
  mode: 'free' | 'busy' | 'gridlock'
  note: string
  bufferMinutes: number
  groupingMultiplier: number
  recommendedMaxStops: number
  maxRouteDurationCap: number
  maxDistanceCap: number
  reliability: number
  slowSharePercent: number
}

export interface TrafficPlanImpact {
  totalDelay: number
  criticalRoutes: number
  avgSegmentSpeed: number
  slowestRoute?: string
  presetMode: TrafficPresetMode
  bufferMinutes: number
}

export type TrafficPresetMode = 'free' | 'busy' | 'gridlock'

export interface TrafficSnapshot {
  timestamp: number
  stats: {
    avgSpeed: number
    medianSpeed?: number
    rawAvgSpeed?: number
    coverageKm?: number
    reliabilityScore?: number
    slowSharePercent?: number
    pressureScore?: number
    totalDelay: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    totalSegments: number
    topCriticalSegments: Array<{
      key?: string
      congestion: number
      speed: number
      distance: number
      severity?: 'low' | 'medium' | 'high' | 'critical'
      start?: [number, number]
      end?: [number, number]
      coordinates?: Array<[number, number]>
    }>
  }
  severitySummary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  sampleSegments: Array<{
    start: [number, number]
    end: [number, number]
    congestion: number
    speed: number
    severity: 'low' | 'medium' | 'high' | 'critical'
  }>
}

export interface RouteAnalytics {
  // Общая статистика
  totalRoutes: number
  totalOrders: number
  totalDistance: number
  totalDuration: number
  avgDistancePerRoute: number
  avgDurationPerRoute: number
  avgOrdersPerRoute: number

  // Эффективность
  avgEfficiency: number
  efficiencyDistribution: {
    excellent: number // > 80%
    good: number // 60-80%
    average: number // 40-60%
    poor: number // < 40%
  }

  // Временные метрики
  timeWindowCompliance: {
    onTime: number
    late: number
    early: number
    noDeadline: number
  }

  // Географические метрики
  zoneDistribution: Record<string, number>
  avgDistanceBetweenStops: number
  maxDistanceBetweenStops: number

  // Пробки
  totalTrafficDelay: number
  routesWithTraffic: number
  criticalTrafficRoutes: number

  // Распределение нагрузки
  loadBalance: {
    minOrders: number
    maxOrders: number
    stdDev: number
    isBalanced: boolean
  }

  // Рекомендации
  recommendations: string[]
}

export interface RouteHistoryEntry {
  id: string
  timestamp: number
  routes: any[]
  settings: {
    maxRouteDurationMin: number
    maxRouteDistanceKm: number
    maxStopsPerRoute: number
    trafficMode: string
    [key: string]: any
  }
  stats: {
    totalRoutes: number
    totalOrders: number
    totalDistance: number
    totalDuration: number
    avgEfficiency: number
  }
  name?: string
  description?: string
}

export interface NotificationPreferences {
  enableWarnings: boolean
  enableTrafficWarnings: boolean
}

export interface OrderInfo {
  orderNumber: string | number
  address: string
  customerName?: string
  customerPhone?: string
  readyAt: number | null
  deadlineAt: number | null
  estimatedArrivalTime: number | null
  raw?: any
}

export interface RouteInfo {
  id: string
  name: string
  routeChain: OrderInfo[]
  startAddress: string
  endAddress: string
  estimatedStartTime: number
  directionsLegs?: any[]
}

export type NotificationType =
  | 'route_delay_warning'
  | 'deadline_risk'
  | 'traffic_warning'
  | 'route_optimization_suggestion'

export interface Notification {
  id: string
  type: NotificationType
  timestamp: number
  routeId: string
  orderNumber?: string | number
  message: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  sent: boolean
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
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

export interface AIPrediction {
  id: string;
  type: 'delivery_time' | 'route_optimization' | 'efficiency' | 'demand';
  title: string;
  description: string;
  confidence: number;
  accuracy: number;
  data: any;
  recommendations: string[];
  createdAt: string;
}

export interface EfficiencyAnalysis {
  courierId: string;
  courierName: string;
  currentEfficiency: number;
  predictedEfficiency: number;
  improvementPotential: number;
  factors: {
    routeOptimization: number;
    timeManagement: number;
    loadBalancing: number;
    trafficAvoidance: number;
  };
  suggestions: string[];
}

export interface DemandForecast {
  period: string;
  predictedOrders: number;
  confidence: number;
  factors: {
    historical: number;
    seasonal: number;
    weather: number;
    events: number;
  };
  recommendations: string[];
}

export interface Geofence {
  id: string;
  name: string;
  type: 'delivery_zone' | 'restricted_area' | 'depot' | 'custom';
  center: Coordinates;
  radius: number;
  color: string;
  isActive: boolean;
  alerts: GeofenceAlert[];
}

export interface GeofenceAlert {
  id: string;
  type: 'entry' | 'exit' | 'violation' | 'delay';
  courier: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isRead: boolean;
  location: Coordinates;
}

export interface CourierLocation {
  courierId: string;
  courierName: string;
  currentLocation: Coordinates;
  lastUpdate: string;
  status: 'online' | 'offline' | 'busy' | 'idle';
  currentRoute?: string;
  speed: number;
  heading: number;
}

export interface MonitoringStats {
  totalCouriers: number;
  onlineCouriers: number;
  activeRoutes: number;
  totalAlerts: number;
  unreadAlerts: number;
  geofenceViolations: number;
}

export interface RouteCalculationMode {
  mode: 'automatic' | 'manual';
  autoTriggerThreshold: number; // Количество заказов для автотриггера
  recalculateOnAdd: boolean; // Пересчитывать при добавлении
  recalculateOnRemove: boolean; // Пересчитывать при удалении
  notifyOnCalculation: boolean; // Показывать уведомления
}

export interface CourierRouteStatus {
  courierId: string;
  courierName: string;
  ordersCount: number;
  hasActiveRoute: boolean;
  routeId?: string;
  lastCalculated?: number;
  needsRecalculation: boolean;
}
