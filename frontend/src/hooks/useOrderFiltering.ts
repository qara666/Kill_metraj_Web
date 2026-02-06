import { useState, useMemo, useEffect } from 'react'
import { ProcessedExcelData } from '../types'
import { CourierSchedule } from '../utils/routes/courierSchedule'

export interface OrderFilters {
    enabled: boolean
    paymentMethods: string[]
    deliveryZones: string[]
    statuses: string[]
    orderTypes: string[]
    excludeCompleted: boolean
    timeRange: { start: string | null; end: string | null }
}

export const useOrderFiltering = (excelData: ProcessedExcelData | null) => {
    const [orderFilters, setOrderFilters] = useState<OrderFilters>({
        enabled: false,
        paymentMethods: [],
        deliveryZones: [],
        statuses: [],
        orderTypes: [],
        excludeCompleted: true,
        timeRange: { start: null, end: null }
    })
    const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false)

    // Schedules
    const [courierSchedules, setCourierSchedules] = useState<CourierSchedule[]>([])
    const [selectedCourierType, setSelectedCourierType] = useState<'car' | 'motorcycle' | 'all'>('all')
    const [enableScheduleFiltering, setEnableScheduleFiltering] = useState<boolean>(false)
    const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false)
    const [editingSchedule, setEditingSchedule] = useState<CourierSchedule | null>(null)

    // Load/Save schedules
    useEffect(() => {
        try {
            const savedSchedules = localStorage.getItem('courier_schedules')
            if (savedSchedules) {
                setCourierSchedules(JSON.parse(savedSchedules))
            }
        } catch (error) {
            console.error('Error loading schedules:', error)
        }
    }, [])

    useEffect(() => {
        if (courierSchedules.length > 0) {
            localStorage.setItem('courier_schedules', JSON.stringify(courierSchedules))
        }
    }, [courierSchedules])

    const availableFilters = useMemo(() => {
        if (!excelData?.orders || excelData.orders.length === 0) {
            return { paymentMethods: [], deliveryZones: [], statuses: [], orderTypes: [] }
        }

        const paymentMethods = new Set<string>()
        const deliveryZones = new Set<string>()
        const statuses = new Set<string>()
        const orderTypes = new Set<string>()

        excelData.orders.forEach((order: any) => {
            if (order.paymentMethod) paymentMethods.add(String(order.paymentMethod).trim())
            if (order.deliveryZone) deliveryZones.add(String(order.deliveryZone).trim())
            if (order.status) statuses.add(String(order.status).trim())
            if (order.orderType) orderTypes.add(String(order.orderType).trim())
        })

        return {
            paymentMethods: Array.from(paymentMethods).sort(),
            deliveryZones: Array.from(deliveryZones).sort(),
            statuses: Array.from(statuses).sort(),
            orderTypes: Array.from(orderTypes).sort()
        }
    }, [excelData])

    const [debouncedFilters, setDebouncedFilters] = useState(orderFilters);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedFilters(orderFilters);
        }, 300);
        return () => clearTimeout(handler);
    }, [orderFilters]);

    const filteredOrders = useMemo(() => {
        if (!excelData?.orders) return []

        // Base restriction: AutoPlanner only takes unassigned orders
        const baseOrders = excelData.orders.filter((order: any) => {
            const courier = (order.courier || '').trim();
            return !courier || courier === 'Не назначено';
        });

        if (!debouncedFilters.enabled) {
            return baseOrders;
        }

        return baseOrders.filter((order: any) => {
            if (debouncedFilters.paymentMethods.length > 0) {
                const p = String(order.paymentMethod || '').trim().toLowerCase()
                if (!debouncedFilters.paymentMethods.some(pm => p.includes(pm.toLowerCase()))) return false
            }
            if (debouncedFilters.deliveryZones.length > 0) {
                const z = String(order.deliveryZone || '').trim().toLowerCase()
                if (!debouncedFilters.deliveryZones.some(zone => z.includes(zone.toLowerCase()))) return false
            }
            if (debouncedFilters.statuses.length > 0) {
                const s = String(order.status || '').trim().toLowerCase()
                if (!debouncedFilters.statuses.some(status => s.includes(status.toLowerCase()))) return false
            }
            if (debouncedFilters.orderTypes.length > 0) {
                const t = String(order.orderType || '').trim().toLowerCase()
                if (!debouncedFilters.orderTypes.some(ot => t.includes(ot.toLowerCase()))) return false
            }
            if (debouncedFilters.excludeCompleted) {
                const status = String(order.status || '').toLowerCase()
                if (status.includes('исполнен') || status.includes('доставлен') || status.includes('выполнен') || status === 'completed') {
                    return false
                }
            }
            if (debouncedFilters.timeRange.start || debouncedFilters.timeRange.end) {
                const deliveryTime = String(order.deliveryTime || order.timeDelivery || '').trim()
                if (deliveryTime) {
                    if (debouncedFilters.timeRange.start && deliveryTime < debouncedFilters.timeRange.start) return false
                    if (debouncedFilters.timeRange.end && deliveryTime > debouncedFilters.timeRange.end) return false
                }
            }
            return true
        })
    }, [excelData, debouncedFilters])

    return {
        orderFilters, setOrderFilters,
        isFiltersExpanded, setIsFiltersExpanded,
        courierSchedules, setCourierSchedules,
        selectedCourierType, setSelectedCourierType,
        enableScheduleFiltering, setEnableScheduleFiltering,
        showScheduleModal, setShowScheduleModal,
        editingSchedule, setEditingSchedule,
        availableFilters,
        filteredOrders
    }
}
