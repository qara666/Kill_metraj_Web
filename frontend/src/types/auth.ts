// Типы для системы аутентификации
export interface User {
    id: number
    username: string
    email?: string | null
    role: 'user' | 'admin'
    isActive: boolean
    divisionId?: string | null
    createdAt: string
    lastLoginAt?: string
    lastLoginIp?: string
    canModifySettings: boolean
}

// Я заменю _id на id во всем фронтенде постепенно, или добавлю совместимость.
// Пока добавлю id в интерфейс.

export interface LoginCredentials {
    username: string
    password: string
}

export interface AuthResponse {
    success: boolean
    data?: {
        user: User
        accessToken: string
        refreshToken: string
    }
    error?: string
}

export interface UserPreset {
    id: number
    userId: number
    settings: {
        // API Keys
        googleMapsApiKey?: string
        mapboxApiKey?: string
        fastopertorApiKey?: string

        // General Settings
        cityBias?: string
        theme?: 'light' | 'dark'
        courierTransportType?: 'car' | 'bike' | 'walk'
        defaultStartAddress?: string
        defaultEndAddress?: string

        // Route Planning Constraints
        maxStopsPerRoute?: number
        maxRouteDurationMin?: number
        maxRouteDistanceKm?: number
        maxWaitPerStopMin?: number

        // Planning Strategy
        orderPriority?: 'deliveryTime' | 'distance' | 'zone' | 'none'
        prioritizeUrgent?: boolean
        urgentThresholdMinutes?: number
        loadBalancing?: 'equal' | 'byZone' | 'byDistance' | 'none'
        maxOrdersPerCourier?: number | null
        minOrdersPerRoute?: number
        groupingStrategy?: 'proximity' | 'zone' | 'timeWindow' | 'paymentMethod' | 'none'
        proximityGroupingRadius?: number
        timeWindowGroupingMinutes?: number

        // Optimization Features
        optimizationGoal?: 'distance' | 'time' | 'balance' | 'turns'
        avoidTraffic?: boolean
        preferMainRoads?: boolean
        minRouteEfficiency?: number
        allowRouteSplitting?: boolean
        preferSingleZoneRoutes?: boolean
        maxReadyTimeDifferenceMinutes?: number
        maxDistanceBetweenOrdersKm?: number | null
        enableOrderCombining?: boolean
        combineMaxDistanceMeters?: number
        combineMaxTimeWindowMinutes?: number
        trafficImpactLevel?: 'low' | 'medium' | 'high'
        lateDeliveryPenalty?: number

        // Custom Filters
        anomalyFilter?: boolean
        anomalyFilterEnabled?: boolean
        mapboxToken?: string
    }
    updatedAt: string
    updatedBy: number
}

export interface AuditLog {
    id: number
    userId: number
    username: string
    action: string
    details: Record<string, any>
    ipAddress: string
    userAgent: string
    timestamp: string
}

export interface CreateUserData {
    username: string
    email?: string
    password: string
    role: 'user' | 'admin'
    divisionId?: string
    canModifySettings?: boolean
}

export interface UpdateUserData {
    email?: string | null
    role?: 'user' | 'admin'
    isActive?: boolean
    divisionId?: string
    password?: string
    canModifySettings?: boolean
}
