export interface Order {
    id: string
    orderNumber: string
    orderType?: string
    address: string
    courier: string
    amount: number
    phone: string
    customerName: string
    isSelected?: boolean
    routeOrder?: number
    plannedTime?: string
    paymentMethod?: string
    coords?: { lat: number; lng: number }
    manualGroupId?: string
    deadlineAt?: number | null
    handoverAt?: number | null
    status?: string
    statusTimings?: {
        assembledAt?: number;
        deliveringAt?: number;
        completedAt?: number;
    };
    raw?: any
    lat?: number
    lng?: number
    kmlZone?: string
    kmlHub?: string
    locationType?: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE'
    deliveryZone?: string
    streetNumberMatched?: boolean
    isAddressLocked?: boolean
    /** If set, this order was transferred to another courier. Original courier loses this order from stats. */
    reassignedToCourier?: string
    /** The courier who originally had this order before it was transferred here. */
    reassignedFromCourier?: string
}

export interface Route {
    id: string
    courier: string
    orders: Order[]
    totalDistance: number
    totalDuration: number
    startAddress: string
    endAddress: string
    isOptimized: boolean
    geoMeta?: any
    createdAt?: number
    legDurations?: number[]
    accurateETA?: any
    isVirtual?: boolean
    title?: string
    hasGeoErrors?: boolean
}
