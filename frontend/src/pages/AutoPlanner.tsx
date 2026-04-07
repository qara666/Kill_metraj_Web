import React, { lazy, Suspense, useCallback, useMemo, useState, useEffect } from 'react'
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { ClockIcon, ChartBarIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { DashboardHeader } from '../components/shared/DashboardHeader'

import { SparklesIcon as SparklesIconSolid } from '@heroicons/react/24/solid'
import { routeHistory } from '../utils/routes/routeHistory'
import { Tooltip } from '../components/shared/Tooltip'
import { VEHICLE_LIMITS } from '../utils/routes/courierSchedule'

// Custom Components
import { AutoPlannerStats } from '../components/autoplanner/AutoPlannerStats'
import { RouteSettingsPanel } from '../components/autoplanner/RouteSettingsPanel'
import { TrafficPresetSelector } from '../components/autoplanner/TrafficPresetSelector'
import { ExtraSettingsPanel } from '../components/autoplanner/ExtraSettingsPanel'
import { ImportSection } from '../components/autoplanner/ImportSection'
import { FiltersSection } from '../components/autoplanner/FiltersSection'
import { MapSection } from '../components/autoplanner/MapSection'
import { RouteResultsView } from '../components/autoplanner/RouteResultsView'
import { RouteDetailModal } from '../components/autoplanner/RouteDetailModal'
import { CourierScheduleModal } from '../components/autoplanner/CourierScheduleModal'
import { OrderDetailsModal } from '../components/autoplanner/OrderDetailsModal'
import { AnalyticsModal } from '../components/autoplanner/AnalyticsModal'
import { HistoryModal } from '../components/autoplanner/HistoryModal'
import { MapSkeleton } from '../components/common/Skeleton'

// Hooks
import { useAutoPlannerSettings } from '../hooks/useAutoPlannerSettings'
import { useRoutePlanning } from '../hooks/useRoutePlanning'
import { useAutoPlannerState } from '../hooks/useAutoPlannerState'
import { useOrderFiltering } from '../hooks/useOrderFiltering'
import { useKmlData } from '../hooks/useKmlData'
import { useTrafficManagement } from '../hooks/useTrafficManagement'
import { AutoPlannerControls } from '../components/autoplanner/AutoPlannerControls'
import { OptimizationProgressView } from '../components/autoplanner/OptimizationProgressView'
import { ExcelDataPreview } from '../components/excel/ExcelDataPreview'
import { useExcelImporter } from '../hooks/useExcelImporter'
import { useAutoPlannerStore } from '../stores/useAutoPlannerStore'
import { localStorageUtils } from '../utils/ui/localStorage'
import { useBackgroundGeocoder } from '../hooks/useBackgroundGeocoder'

// Lazy loaded components
import type { TourStep } from '../components/features/HelpTour'
const HelpModal = lazy(() => import('../components/modals/HelpModal').then(m => ({ default: m.HelpModal })))
const HelpTour = lazy(() => import('../components/features/HelpTour').then(m => ({ default: m.HelpTour })))
const TrafficHeatmap = lazy(() => import('../components/maps/TrafficHeatmap')
    .then(m => {
        const component = m.TrafficHeatmap || m.default
        if (component) {
            return { default: component }
        }
        throw new Error('TrafficHeatmap component not found')
    })
    .catch(err => {
        console.error('Error loading TrafficHeatmap:', err)
        return { default: () => <MapSkeleton /> }
    })
)

export const AutoPlanner: React.FC = () => {
    const { isDark } = useTheme()
    const {
        maxStopsPerRoute,
        setMaxStopsPerRoute,
        maxRouteDurationMin,
        setMaxRouteDurationMin,
        maxRouteDistanceKm,
        setMaxRouteDistanceKm,
        maxWaitPerStopMin,
        setMaxWaitPerStopMin,
        routePlanningSettings,
        updatePlanningSettings
    } = useAutoPlannerSettings()

    // --- UI State (Zustand) ---
    const {
        isTrafficHeatmapCollapsed,
        setTrafficHeatmapCollapsed,
        enableScheduleFiltering,
        setEnableScheduleFiltering
    } = useAutoPlannerStore()


    // --- New Hooks ---
    const { selectedZones, cachedHubPolygons, cachedAllKmlPolygons } = useKmlData()
    const state = useAutoPlannerState()
    const {
        excelData,
        setExcelData,
        selectedOrder,
        setSelectedOrder,
        plannedRoutes,
        setPlannedRoutes,
        errorMsg,
        setErrorMsg,
        planTrafficImpact,
        setPlanTrafficImpact,
        lastPlanPreset,
        setLastPlanPreset,
        routeAnalytics,
        setRouteAnalytics,
        selectedRoute,
        setSelectedRoute,
        expandedRouteModal,
        setExpandedRouteModal,
        enableNotifications,
        setEnableNotifications,
        notificationPreferences,
        setNotificationPreferences,
        showHistoryModal,
        setShowHistoryModal,
        showAnalyticsModal,
        setShowAnalyticsModal,
        routeHistoryEntries,
        setRouteHistoryEntries,
        showHelpModal,
        setShowHelpModal,
        showHelpTour,
        setShowHelpTour,
        hasSeenHelp,
        setHasSeenHelp
    } = state

    // --- WebSocket Hook for Real-time Updates ---
    useDashboardWebSocket({
        onDataLoaded: (data) => {
            setExcelData(data);
        },
        enabled: true
    });

    // Очищаем маршруты, если данные полностью сброшены
    useEffect(() => {
        if (!excelData) {
            setPlannedRoutes([]);
        }
    }, [excelData, setPlannedRoutes]);

    const trafficState = useTrafficManagement(maxStopsPerRoute, maxRouteDurationMin, maxRouteDistanceKm)
    const {
        trafficSnapshot,
        trafficSnapshotRef,
        trafficModeOverride,
        setTrafficModeOverride,
        trafficPreset,
        trafficAdvisory,
        sectorCityName,
        mapboxTokenState,
        syncSectorSettings
    } = trafficState

    const filterState = useOrderFiltering(excelData)
    const {
        orderFilters,
        setOrderFilters,
        isFiltersExpanded,
        setIsFiltersExpanded,
        courierSchedules,
        setCourierSchedules,
        selectedCourierType,
        setSelectedCourierType,
        showScheduleModal,
        setShowScheduleModal,
        editingSchedule,
        setEditingSchedule,
        availableFilters,
        filteredOrders: rawFilteredOrders
    } = filterState

    const filteredOrders = React.useDeferredValue(rawFilteredOrders)

    // --- Background Pre-geocoder (L1 + L2 Cache Warming) ---
    useBackgroundGeocoder(filteredOrders)

    // --- Excel Importer Hook ---
    const { handleScheduleOnlyUpload } = useExcelImporter(setExcelData, setCourierSchedules)

    // State to control Data Preview modal
    const [showDataPreview, setShowDataPreview] = useState(false)



    // Sync courier schedules when excelData changes (if data comes from Dashboard API)
    useEffect(() => {
        if (excelData?.couriers && excelData.couriers.length > 0) {
            setCourierSchedules(excelData.couriers);
        }
    }, [excelData?.couriers, setCourierSchedules]);

    const { enableOrderCombining, combineMaxDistanceMeters, combineMaxTimeWindowMinutes } = routePlanningSettings

    // --- Effects & Handlers ---
    useEffect(() => {
        syncSectorSettings()
    }, [syncSectorSettings])

    useEffect(() => {
        const handleSettingsUpdated = () => syncSectorSettings()
        const handleStorage = (event: StorageEvent) => {
            if (event.key && ['km_settings', 'km_mapbox_token', 'km_city_bias'].includes(event.key)) {
                syncSectorSettings()
            }
        }
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') syncSectorSettings()
        }
        window.addEventListener('km-settings-updated', handleSettingsUpdated)
        window.addEventListener('storage', handleStorage)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => {
            window.removeEventListener('km-settings-updated', handleSettingsUpdated)
            window.removeEventListener('storage', handleStorage)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [syncSectorSettings])

    const handleScheduleUpload = useCallback(async (file: File) => {
        await handleScheduleOnlyUpload(file)
    }, [handleScheduleOnlyUpload])

    // --- Route Planning Hook ---
    const { defaultStartAddress, defaultStartLat, defaultStartLng, defaultEndAddress, defaultEndLat, defaultEndLng } = useMemo(() => localStorageUtils.getAllSettings(), [])

    const { isPlanning, optimizationProgress, planRoutes } = useRoutePlanning(
        excelData?.orders || null,
        routePlanningSettings,
        trafficSnapshotRef,
        filteredOrders,
        notificationPreferences,
        trafficModeOverride === 'auto' ? null : trafficModeOverride,
        maxStopsPerRoute,
        maxRouteDurationMin,
        maxRouteDistanceKm,
        routePlanningSettings.maxOrdersPerCourier || 50,
        defaultStartAddress,
        defaultStartLat || null,
        defaultStartLng || null,
        defaultEndAddress,
        defaultEndLat || null,
        defaultEndLng || null,
        selectedZones,
        cachedHubPolygons,
        cachedAllKmlPolygons,
        setPlannedRoutes,
        setErrorMsg,
        setPlanTrafficImpact,
        setLastPlanPreset,
        setRouteAnalytics
    )

    const ordersCount = filteredOrders.length

    const planButtonLabel = useMemo(() => {
        const count = filteredOrders.length
        const base = count > 0 ? `Оптимизировать ${count} заказов` : 'Нет заказов для планирования'
        if (!trafficSnapshot) return base
        if (trafficAdvisory === 'critical') return `${base} · Пробки`
        if (trafficAdvisory === 'high') return `${base} · ⚠️Трафик`
        return base
    }, [filteredOrders.length, trafficSnapshot, trafficAdvisory])

    return (
        <div className="space-y-6">
            <DashboardHeader
                icon={SparklesIconSolid}
                title="РОБОТ КЕРУВАННЯ"
                subtitle="АВТОМАТИЧНА ОПТИМІЗАЦІЯ"
                statusMetrics={[
                    {
                        label: "ЗАКАЗІВ ДЛЯ ПЛАНУ",
                        value: filteredOrders.length,
                        color: "bg-purple-500"
                    }
                ]}
                actions={
                    <Tooltip content="Открыть справку и инструкции" position="left">
                        <button
                            onClick={() => {
                                setShowHelpModal(true)
                                if (!hasSeenHelp) {
                                    localStorage.setItem('km_has_seen_help', 'true')
                                    setHasSeenHelp(true)
                                }
                            }}
                            className={clsx(
                                'p-3 rounded-xl transition-all hover:scale-105',
                                isDark ? 'bg-gray-700 hover:bg-gray-600 text-blue-400' : 'bg-white hover:bg-blue-50 text-blue-600 shadow-lg'
                            )}
                        >
                            <QuestionMarkCircleIcon className="w-6 h-6" />
                        </button>
                    </Tooltip>
                }
            />

            {/* Основной контент */}
            <div className={clsx(
                'rounded-3xl p-4 shadow-xl border-2',
                isDark ? 'bg-gray-800/80 backdrop-blur-sm' : 'bg-white border-gray-200'
            )}>
                <AutoPlannerStats excelData={excelData ? { ...excelData, orders: filteredOrders } : null} routes={plannedRoutes} />
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <div className="lg:col-span-1">
                        <ImportSection isDark={isDark} excelData={excelData} setExcelData={setExcelData} setCourierSchedules={setCourierSchedules} ordersCount={ordersCount} />
                    </div>
                    <div className="lg:col-span-2" id="route-settings-panel">
                        <RouteSettingsPanel
                            maxRouteDurationMin={maxRouteDurationMin}
                            setMaxRouteDurationMin={setMaxRouteDurationMin}
                            maxRouteDistanceKm={maxRouteDistanceKm}
                            setMaxRouteDistanceKm={setMaxRouteDistanceKm}
                            maxWaitPerStopMin={maxWaitPerStopMin}
                            setMaxWaitPerStopMin={setMaxWaitPerStopMin}
                            maxStopsPerRoute={maxStopsPerRoute}
                            setMaxStopsPerRoute={setMaxStopsPerRoute}
                            routePlanningSettings={routePlanningSettings}
                            updatePlanningSettings={updatePlanningSettings}
                            selectedCourierType={selectedCourierType}
                            setSelectedCourierType={setSelectedCourierType}
                            enableScheduleFiltering={enableScheduleFiltering}
                            setEnableScheduleFiltering={setEnableScheduleFiltering}
                            courierSchedulesCount={courierSchedules.length}
                            onManageSchedules={() => setShowScheduleModal(true)}
                            onUploadSchedules={handleScheduleUpload}
                            vehicleLimits={VEHICLE_LIMITS}
                        />
                    </div>
                    <div className="lg:col-span-1">
                        <ExtraSettingsPanel
                            isDark={isDark}
                            enableOrderCombining={enableOrderCombining}
                            combineMaxDistanceMeters={combineMaxDistanceMeters}
                            combineMaxTimeWindowMinutes={combineMaxTimeWindowMinutes}
                            enableNotifications={enableNotifications}
                            notificationPreferences={notificationPreferences}
                            trafficImpactLevel={routePlanningSettings.trafficImpactLevel}
                            lateDeliveryPenalty={routePlanningSettings.lateDeliveryPenalty}
                            updatePlanningSettings={updatePlanningSettings}
                            setEnableNotifications={setEnableNotifications}
                            setNotificationPreferences={setNotificationPreferences}
                        />
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-dashed border-gray-700/50">
                    <AutoPlannerControls
                        isPlanning={isPlanning}
                        onPlan={planRoutes}
                        onSettings={() => setShowHelpModal(true)}
                        hasData={!!excelData && ordersCount > 0}
                        ordersCount={ordersCount}
                        planButtonLabel={planButtonLabel}
                        isDark={isDark}
                        trafficAdvisory={trafficAdvisory}
                        trafficPreset={trafficPreset}
                        lastPlanPreset={lastPlanPreset}
                        planTrafficImpact={planTrafficImpact}
                    />
                </div>

                {excelData && (
                    <FiltersSection
                        isDark={isDark}
                        ordersCount={excelData?.orders?.length || 0}
                        filteredOrdersCount={filteredOrders.length}
                        isFiltersExpanded={isFiltersExpanded}
                        setIsFiltersExpanded={setIsFiltersExpanded}
                        orderFilters={orderFilters}
                        setOrderFilters={setOrderFilters}
                        availableFilters={availableFilters}
                    />
                )}

                <div className="mt-6">
                    {errorMsg && (
                        <div className={clsx('mb-3 rounded-lg px-3 py-2 text-sm', isDark ? 'bg-red-900/40 text-red-200 border border-red-700/50' : 'bg-red-50 text-red-700 border border-red-200')}>
                            {errorMsg}
                        </div>
                    )}
                    <OptimizationProgressView progress={optimizationProgress} isDark={isDark} />
                    {trafficSnapshot && (
                        <div className={clsx(
                            'mb-3 rounded-lg p-4 border text-xs space-y-2',
                            trafficAdvisory === 'critical' ? (isDark ? 'border-red-700 bg-red-900/20 text-red-100' : 'border-red-200 bg-red-50 text-red-700') : trafficAdvisory === 'high' ? (isDark ? 'border-yellow-700 bg-yellow-900/20 text-yellow-100' : 'border-yellow-200 bg-yellow-50 text-yellow-800') : (isDark ? 'border-emerald-700 bg-emerald-900/20 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
                        )}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-sm">Трафик {new Date(trafficSnapshot?.timestamp || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span>Средняя скорость: {trafficSnapshot?.stats?.avgSpeed || 0} км/ч</span>
                                <span>Критических: {trafficSnapshot?.stats?.criticalCount || 0}</span>
                            </div>
                        </div>
                    )}
                </div>

                <TrafficPresetSelector
                    isDark={isDark}
                    currentMode={trafficModeOverride}
                    onChange={setTrafficModeOverride}
                    defaults={{ maxStops: maxStopsPerRoute, maxDuration: maxRouteDurationMin, maxDistance: maxRouteDistanceKm }}
                />

                <div className={clsx('mt-6 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white')}>
                    <button onClick={() => setTrafficHeatmapCollapsed(!isTrafficHeatmapCollapsed)} className={clsx('w-full px-4 py-3 flex items-center justify-between transition-colors', isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50')}>
                        <div className={clsx('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-800')}>
                            <span>{isTrafficHeatmapCollapsed ? '▶' : '▼'}</span>
                            <span>Тепловая карта трафика (Mapbox)</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Live</span>
                        </div>
                    </button>
                    {!isTrafficHeatmapCollapsed && (
                        <div className="p-4">
                            <Suspense fallback={<div className="text-sm text-center py-8">Загрузка карты...</div>}>
                                <TrafficHeatmap sectorName={sectorCityName || 'Сектор'} mapboxToken={mapboxTokenState || ''} />
                            </Suspense>
                        </div>
                    )}
                </div>


                {/* Coverage analysis removed */}

                {(plannedRoutes.length > 0 || (isPlanning === false && excelData && ordersCount > 0)) && (
                    <div className="mt-6" data-tour="routes">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <div className="text-sm">{`Сформировано маршрутов: ${plannedRoutes.length}`}</div>
                            {plannedRoutes.length > 0 && (
                                <div className="flex items-center gap-2" data-tour="analytics">
                                    <button onClick={() => setShowAnalyticsModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center gap-2">
                                        <ChartBarIcon className="w-5 h-5" />
                                        <span>Аналитика</span>
                                    </button>
                                    <button onClick={() => { setRouteHistoryEntries(routeHistory.getAll()); setShowHistoryModal(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2">
                                        <ClockIcon className="w-5 h-5" />
                                        <span>История</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                            <div className="lg:sticky lg:top-8 h-fit">
                                <MapSection routes={plannedRoutes} selectedRoute={selectedRoute} onRouteSelect={setSelectedRoute} onOrderClick={setSelectedOrder} isDark={isDark} />
                            </div>
                            <div>
                                <Suspense fallback={<MapSkeleton />}>
                                    <RouteResultsView
                                        plannedRoutes={plannedRoutes}
                                        isDark={isDark}
                                        selectedRoute={selectedRoute}
                                        setSelectedRoute={setSelectedRoute}
                                        setSelectedOrder={setSelectedOrder}
                                        enableNotifications={enableNotifications}
                                        onExpandRoute={setExpandedRouteModal}
                                    />
                                </Suspense>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Suspense fallback={null}>
                {excelData && <ExcelDataPreview data={excelData} isVisible={showDataPreview} onClose={() => setShowDataPreview(false)} onConfirm={() => setShowDataPreview(false)} />}
                <OrderDetailsModal isDark={isDark} selectedOrder={selectedOrder} onClose={() => setSelectedOrder(null)} />
                <CourierScheduleModal isDark={isDark} show={showScheduleModal} onClose={() => setShowScheduleModal(false)} schedules={courierSchedules} setSchedules={setCourierSchedules} editingSchedule={editingSchedule} setEditingSchedule={setEditingSchedule} />
                <AnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} isDark={isDark} routeAnalytics={routeAnalytics} />
                <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} isDark={isDark} routeHistoryEntries={routeHistoryEntries} setRouteHistoryEntries={setRouteHistoryEntries} setPlannedRoutes={setPlannedRoutes} />
                <RouteDetailModal isOpen={!!expandedRouteModal} onClose={() => setExpandedRouteModal(null)} isDark={isDark} route={expandedRouteModal} onOrderClick={setSelectedOrder} />
            </Suspense>

            {showHelpModal && (
                <Suspense fallback={null}>
                    <HelpModal
                        isOpen={showHelpModal}
                        onClose={() => { setShowHelpModal(false); localStorage.setItem('km_has_seen_help', 'true'); setHasSeenHelp(true); }}
                        onStartTour={() => { setShowHelpModal(false); setTimeout(() => setShowHelpTour(true), 300); }}
                    />
                </Suspense>
            )}

            {showHelpTour && (
                <Suspense fallback={null}>
                    <HelpTour
                        isOpen={showHelpTour}
                        onClose={() => { setShowHelpTour(false); localStorage.setItem('km_has_seen_help', 'true'); setHasSeenHelp(true); }}
                        onComplete={() => { setShowHelpTour(false); localStorage.setItem('km_has_seen_help', 'true'); setHasSeenHelp(true); }}
                        steps={[
                            {
                                id: 'upload',
                                title: 'Загрузка данных',
                                content: 'Начните с загрузки файла Excel с данными о заказах. Обязательные колонки: Адрес, Время, Номер.',
                                target: '[data-tour="upload"]',
                                position: 'bottom'
                            },
                            {
                                id: 'settings',
                                title: 'Настройки',
                                content: 'Настройте лимиты для маршрутов: остановки, расстояние, время.',
                                target: '[data-tour="settings"]',
                                position: 'bottom'
                            },
                            {
                                id: 'plan',
                                title: 'Планирование',
                                content: 'Нажмите кнопку планирования для создания оптимальных маршрутов.',
                                target: '[data-tour="plan"]',
                                position: 'top'
                            },
                            {
                                id: 'routes',
                                title: 'Результаты',
                                content: 'Просмотрите созданные маршруты на карте и в списке.',
                                target: '[data-tour="routes"]',
                                position: 'top'
                            },
                            {
                                id: 'analytics',
                                title: 'Аналитика',
                                content: 'Изучайте эффективность ваших маршрутов.',
                                target: '[data-tour="analytics"]',
                                position: 'left'
                            }
                        ] as TourStep[]}
                    />
                </Suspense>
            )}
        </div>
    )
}

export default AutoPlanner