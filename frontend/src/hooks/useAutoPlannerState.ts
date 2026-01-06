import { useState, useEffect } from 'react'
import {
    RouteAnalytics,
    TrafficPlanImpact,
    TrafficPresetInfo,
    RouteHistoryEntry,
    NotificationPreferences,
    ProcessedExcelData,
    Route
} from '../types'
import { routeHistory } from '../utils/routes/routeHistory'
import { calculateRouteAnalytics } from '../utils/routes/routeAnalytics'

const PLANNED_ROUTES_STORAGE_KEY = 'km_planned_routes'
const FILE_NAME_STORAGE_KEY = 'km_file_name'

import { useExcelData } from '../contexts/ExcelDataContext'

export const useAutoPlannerState = () => {
    const { excelData, setExcelData } = useExcelData()
    const [fileName, setFileName] = useState('')
    const [selectedOrder, setSelectedOrder] = useState<any>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [htmlUrl, setHtmlUrl] = useState('')
    const [isProcessingHtml, setIsProcessingHtml] = useState(false)
    const [plannedRoutes, setPlannedRoutes] = useState<any[]>([])
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [excludedOutsideSector, setExcludedOutsideSector] = useState<number>(0)
    const [planTrafficImpact, setPlanTrafficImpact] = useState<TrafficPlanImpact | null>(null)
    const [lastPlanPreset, setLastPlanPreset] = useState<TrafficPresetInfo | null>(null)
    const [routeAnalytics, setRouteAnalytics] = useState<RouteAnalytics | null>(null)
    const [selectedRoute, setSelectedRoute] = useState<any>(null)
    const [expandedRouteModal, setExpandedRouteModal] = useState<any>(null)

    // Notifications
    const [enableNotifications, setEnableNotifications] = useState<boolean>(true)
    const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
        enableWarnings: true,
        enableTrafficWarnings: true
    })

    // UI Modals
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false)
    const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false)
    const [routeHistoryEntries, setRouteHistoryEntries] = useState<RouteHistoryEntry[]>([])

    // Help System
    const [showHelpModal, setShowHelpModal] = useState(false)
    const [showHelpTour, setShowHelpTour] = useState(false)
    const [hasSeenHelp, setHasSeenHelp] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('km_has_seen_help') === 'true'
        }
        return false
    })

    // Restore state
    useEffect(() => {
        if (typeof window === 'undefined') return

        setRouteHistoryEntries(routeHistory.getAll())

        try {
            const savedRoutes = localStorage.getItem(PLANNED_ROUTES_STORAGE_KEY)
            if (savedRoutes) {
                const routes = JSON.parse(savedRoutes)
                const routesTimestamp = localStorage.getItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
                if (routesTimestamp) {
                    const age = Date.now() - parseInt(routesTimestamp, 10)
                    if (age < 24 * 60 * 60 * 1000) {
                        setPlannedRoutes(routes)
                        if (routes.length > 0) {
                            setRouteAnalytics(calculateRouteAnalytics(routes))
                        }
                    } else {
                        localStorage.removeItem(PLANNED_ROUTES_STORAGE_KEY)
                        localStorage.removeItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
                    }
                } else {
                    setPlannedRoutes(routes)
                    if (routes.length > 0) {
                        setRouteAnalytics(calculateRouteAnalytics(routes))
                    }
                }
            }
        } catch (error) {
            console.error('Error restoring routes:', error)
        }

        try {
            const savedFileName = localStorage.getItem(FILE_NAME_STORAGE_KEY)
            if (savedFileName) setFileName(savedFileName)
        } catch (error) {
            console.error('Error restoring file name:', error)
        }
    }, [])

    // Persistence
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (plannedRoutes.length > 0) {
            localStorage.setItem(PLANNED_ROUTES_STORAGE_KEY, JSON.stringify(plannedRoutes))
            localStorage.setItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`, Date.now().toString())
        } else {
            localStorage.removeItem(PLANNED_ROUTES_STORAGE_KEY)
            localStorage.removeItem(`${PLANNED_ROUTES_STORAGE_KEY}_timestamp`)
        }
    }, [plannedRoutes])

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (fileName) {
            localStorage.setItem(FILE_NAME_STORAGE_KEY, fileName)
        } else {
            localStorage.removeItem(FILE_NAME_STORAGE_KEY)
        }
    }, [fileName])

    return {
        excelData, setExcelData,
        fileName, setFileName,
        selectedOrder, setSelectedOrder,
        isProcessing, setIsProcessing,
        htmlUrl, setHtmlUrl,
        isProcessingHtml, setIsProcessingHtml,
        plannedRoutes, setPlannedRoutes,
        errorMsg, setErrorMsg,
        excludedOutsideSector, setExcludedOutsideSector,
        planTrafficImpact, setPlanTrafficImpact,
        lastPlanPreset, setLastPlanPreset,
        routeAnalytics, setRouteAnalytics,
        selectedRoute, setSelectedRoute,
        expandedRouteModal, setExpandedRouteModal,
        enableNotifications, setEnableNotifications,
        notificationPreferences, setNotificationPreferences,
        showHistoryModal, setShowHistoryModal,
        showAnalyticsModal, setShowAnalyticsModal,
        routeHistoryEntries, setRouteHistoryEntries,
        showHelpModal, setShowHelpModal,
        showHelpTour, setShowHelpTour,
        hasSeenHelp, setHasSeenHelp
    }
}
