import React, { lazy, Suspense, useCallback, useMemo, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  ClockIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import {
  SparklesIcon as SparklesIconSolid
} from '@heroicons/react/24/solid'

import { routeHistory } from '../utils/routes/routeHistory'
import { Tooltip } from '../components/shared/Tooltip'
import { VEHICLE_LIMITS } from '../utils/routes/courierSchedule'
import type { CoverageAnalysis } from '../utils/processing/coverageAnalysis'
import { ProcessedExcelData } from '../types'
import { logger } from '../utils/ui/logger'

// Custom Components
import { AutoPlannerStats } from '../components/autoplanner/AutoPlannerStats'
import { RouteSettingsPanel } from '../components/autoplanner/RouteSettingsPanel'
import { TrafficPresetSelector } from '../components/autoplanner/TrafficPresetSelector'
import { ExtraSettingsPanel } from '../components/autoplanner/ExtraSettingsPanel'
import { ImportSection } from '../components/autoplanner/ImportSection'
import { FiltersSection } from '../components/autoplanner/FiltersSection'
import { MapSection } from '../components/autoplanner/MapSection'
const RouteResultsView = lazy(() => import('../components/autoplanner/RouteResultsView').then(m => ({ default: m.RouteResultsView })))
const RouteDetailModal = lazy(() => import('../components/autoplanner/RouteDetailModal').then(m => ({ default: m.RouteDetailModal })))
const CourierScheduleModal = lazy(() => import('../components/autoplanner/CourierScheduleModal').then(m => ({ default: m.CourierScheduleModal })))
const OrderDetailsModal = lazy(() => import('../components/autoplanner/OrderDetailsModal').then(m => ({ default: m.OrderDetailsModal })))
const AnalyticsModal = lazy(() => import('../components/autoplanner/AnalyticsModal').then(m => ({ default: m.AnalyticsModal })))
const HistoryModal = lazy(() => import('../components/autoplanner/HistoryModal').then(m => ({ default: m.HistoryModal })))

import { RouteCardSkeleton, MapSkeleton } from '../components/common/Skeleton'
import { useAutoPlannerSettings } from '../hooks/useAutoPlannerSettings'
import { useRoutePlanning } from '../hooks/useRoutePlanning'
import { useAutoPlannerState } from '../hooks/useAutoPlannerState'
import { useOrderFiltering } from '../hooks/useOrderFiltering'
import { useTrafficManagement } from '../hooks/useTrafficManagement'
import { AutoPlannerControls } from '../components/autoplanner/AutoPlannerControls'
import { OptimizationProgressView } from '../components/autoplanner/OptimizationProgressView'
import { CoverageAnalysisView } from '../components/autoplanner/CoverageAnalysisView'
import { ExcelDataPreview } from '../components/excel/ExcelDataPreview'
import { useExcelImporter } from '../hooks/useExcelImporter'
import { useAutoPlannerStore } from '../stores/useAutoPlannerStore'
import { useSwaggerAutoRefresh } from '../hooks/useSwaggerAutoRefresh'

// Lazy loaded components
import type { TourStep } from '../components/features/HelpTour'
const HelpModal = lazy(() => import('../components/modals/HelpModal').then(m => ({ default: m.HelpModal })))
const HelpTour = lazy(() => import('../components/features/HelpTour').then(m => ({ default: m.HelpTour })))
const TrafficHeatmap = lazy(() =>
  import('../components/maps/TrafficHeatmap')
    .then(m => {
      // Поддерживаем как named, так и default export
      const component = m.TrafficHeatmap || m.default
      if (component) {
        return { default: component }
      }
      throw new Error('TrafficHeatmap component not found')
    })
    .catch(err => {
      console.error('Error loading TrafficHeatmap:', err)
      // Возвращаем fallback компонент
      return { default: () => <MapSkeleton /> }
    })
)
const WorkloadHeatmap = lazy(() => import('../components/maps/WorkloadHeatmap').then(m => ({ default: m.WorkloadHeatmap })))


// Helpers moved to hooks

// Компонент для визуализации маршрута на карте
//

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
    isTrafficHeatmapCollapsed, setTrafficHeatmapCollapsed,
    isWorkloadHeatmapCollapsed, setWorkloadHeatmapCollapsed,
    enableCoverageAnalysis,
    enableWorkloadHeatmap,
    enableScheduleFiltering, setEnableScheduleFiltering
  } = useAutoPlannerStore()

  // --- Advanced Analytics State ---
  const [coverageAnalysis, _setCoverageAnalysis] = useState<CoverageAnalysis | null>(null)
  const [workloadHeatmapData, setWorkloadHeatmapData] = useState<any[]>([])

  // --- New Hooks ---
  const state = useAutoPlannerState()
  const {
    excelData, setExcelData,
    selectedOrder, setSelectedOrder,
    plannedRoutes, setPlannedRoutes,
    errorMsg, setErrorMsg,
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
  } = state

  const trafficState = useTrafficManagement(maxStopsPerRoute, maxRouteDurationMin, maxRouteDistanceKm)
  const {
    trafficSnapshot,
    trafficSnapshotRef,
    trafficModeOverride,
    setTrafficModeOverride,
    trafficPreset,
    trafficAdvisory,
    sectorCityName,
    sectorPathState,
    mapboxTokenState,
    syncSectorSettings
  } = trafficState

  const filterState = useOrderFiltering(excelData)
  const {
    orderFilters, setOrderFilters,
    isFiltersExpanded, setIsFiltersExpanded,
    courierSchedules, setCourierSchedules,
    selectedCourierType, setSelectedCourierType,
    showScheduleModal, setShowScheduleModal,
    editingSchedule, setEditingSchedule,
    availableFilters,
    filteredOrders
  } = filterState

  // --- Excel Importer Hook ---
  const { handleScheduleOnlyUpload } = useExcelImporter(setExcelData, setCourierSchedules)

  // State to control Data Preview modal
  const [showDataPreview, setShowDataPreview] = useState(false);

  // Обработчик загрузки данных из Swagger API (перемещен из ImportSection)
  const handleSwaggerDataLoaded = useCallback(async (data: ProcessedExcelData) => {
    setExcelData(data);
    logger.info(`✅ Загружено ${data.orders.length} заказов из Swagger API`);

    // Автоматическое добавление курьеров
    if (data.couriers && data.couriers.length > 0) {
      setCourierSchedules(data.couriers);
      logger.info(`✅ Автоматически добавлено ${data.couriers.length} курьеров`);
    }

    setShowDataPreview(true); // Show preview modal
    // Геокодирование выполняется автоматически через useEffect при изменении excelData
  }, [setExcelData, setCourierSchedules]);

  // Get time window from store
  const { swaggerTimeDeliveryBeg, swaggerTimeDeliveryEnd } = useAutoPlannerStore();

  // Auto-refresh hook - automatically syncs data every 5 minutes
  const { performSync: performManualSync } = useSwaggerAutoRefresh({
    dateTimeDeliveryBeg: swaggerTimeDeliveryBeg,
    dateTimeDeliveryEnd: swaggerTimeDeliveryEnd,
    onDataLoaded: handleSwaggerDataLoaded,
    enabled: true, // Hook will check swaggerAutoRefreshEnabled internally
  });

  const { enableOrderCombining, combineMaxDistanceMeters, combineMaxTimeWindowMinutes } = routePlanningSettings

  // --- Effects & Handlers ---
  useEffect(() => {
    syncSectorSettings()
  }, [syncSectorSettings])

  useEffect(() => {
    const handleSettingsUpdated = () => syncSectorSettings()
    const handleStorage = (event: StorageEvent) => {
      if (event.key && ['km_settings', 'km_city_sectors', 'km_mapbox_token', 'km_city_bias'].includes(event.key)) {
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

  // Handlers moved to sub-components

  // --- Route Planning Hook ---
  const {
    isPlanning,
    optimizationProgress,
    planRoutes
  } = useRoutePlanning(
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
    setPlannedRoutes,
    setErrorMsg,
    setPlanTrafficImpact,
    setLastPlanPreset,
    setRouteAnalytics
  )

  const ordersCount = excelData?.orders?.length || 0
  const planButtonLabel = useMemo(() => {
    const base = `Автосоздать маршруты${orderFilters.enabled ? ` (${filteredOrders.length} заказов)` : ''}`
    if (!trafficSnapshot) return base
    if (trafficAdvisory === 'critical') return `${base} · критический трафик`
    if (trafficAdvisory === 'high') return `${base} · высокий трафик`
    return base
  }, [filteredOrders.length, orderFilters.enabled, trafficSnapshot, trafficAdvisory])

  return (
    <div className="space-y-6">
      {/* Заголовок с градиентом */}
      <div className={clsx(
        'rounded-3xl p-8 shadow-2xl border-2 overflow-hidden relative',
        isDark
          ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border-gray-700'
          : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 opacity-50"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={clsx(
                'p-4 rounded-2xl shadow-lg',
                isDark
                  ? 'bg-gradient-to-br from-blue-600 to-purple-600'
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                <SparklesIconSolid className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className={clsx(
                  'text-3xl font-bold mb-1 bg-gradient-to-r bg-clip-text text-transparent',
                  isDark
                    ? 'from-blue-400 to-purple-400'
                    : 'from-blue-600 to-indigo-600'
                )}>
                  Автоматическая оптимизация маршрутов
                </h2>
                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Умное планирование маршрутов с учетом трафика и приоритетов
                </p>
              </div>
            </div>
            <Tooltip
              content="Открыть справку и инструкции по использованию системы"
              position="left"
            >
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
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-blue-400'
                    : 'bg-white hover:bg-blue-50 text-blue-600 shadow-lg'
                )}
              >
                <QuestionMarkCircleIcon className="w-6 h-6" />
              </button>
            </Tooltip>
          </div>

          {/* Статистика */}
          <AutoPlannerStats excelData={excelData} routes={plannedRoutes} />
        </div>
      </div>

      {/* Основной контент */}
      <div className={clsx(
        'rounded-3xl p-4 shadow-xl border-2',
        isDark ? 'bg-gray-800/80 border-gray-700 backdrop-blur-sm' : 'bg-white border-gray-200'
      )}>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Секция импорта */}
          <ImportSection
            isDark={isDark}
            excelData={excelData}
            setExcelData={setExcelData}
            setCourierSchedules={setCourierSchedules}
            ordersCount={excelData?.orders.length || 0}
          />

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

          <div className="space-y-4">
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
              onManualSync={performManualSync}
            />
          </div>
        </div>

        {/* Секция фильтров */}
        {excelData && (
          <FiltersSection
            isDark={isDark}
            ordersCount={excelData.orders.length}
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

          {/* Визуализация прогресса оптимизации (пункт 14) */}
          <OptimizationProgressView
            progress={optimizationProgress}
            isDark={isDark}
          />

          {trafficSnapshot && (
            <div
              className={clsx(
                'mb-3 rounded-lg p-4 border text-xs space-y-2',
                trafficAdvisory === 'critical'
                  ? (isDark ? 'border-red-700 bg-red-900/20 text-red-100' : 'border-red-200 bg-red-50 text-red-700')
                  : trafficAdvisory === 'high'
                    ? (isDark ? 'border-yellow-700 bg-yellow-900/20 text-yellow-100' : 'border-yellow-200 bg-yellow-50 text-yellow-800')
                    : (isDark ? 'border-emerald-700 bg-emerald-900/20 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-sm">Трафик {new Date(trafficSnapshot.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>Средняя скорость: {trafficSnapshot.stats.avgSpeed} км/ч</span>
                <span>Критических: {trafficSnapshot.stats.criticalCount}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span>Медиана: {trafficSnapshot.stats.medianSpeed ?? trafficSnapshot.stats.avgSpeed} км/ч</span>
                <span>Покрытие: {(trafficSnapshot.stats.coverageKm ?? 0).toFixed(1)} км</span>
                <span>Надежность: {trafficSnapshot.stats.reliabilityScore ?? 0}%</span>
                <span>Доля &lt; 20 км/ч: {trafficSnapshot.stats.slowSharePercent ?? 0}%</span>
              </div>
            </div>
          )}

          <AutoPlannerControls
            isPlanning={isPlanning}
            onPlan={planRoutes}
            onSettings={() => {
              const settingsPanel = document.getElementById('route-settings-panel')
              if (settingsPanel) {
                settingsPanel.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            hasData={ordersCount > 0}
            ordersCount={ordersCount}
            planButtonLabel={planButtonLabel}
            isDark={isDark}
            trafficAdvisory={trafficAdvisory}
            trafficPreset={trafficPreset}
            lastPlanPreset={lastPlanPreset}
            planTrafficImpact={planTrafficImpact}
          />
        </div>

        <TrafficPresetSelector
          isDark={isDark}
          currentMode={trafficModeOverride}
          onChange={setTrafficModeOverride}
          defaults={{
            maxStops: maxStopsPerRoute,
            maxDuration: maxRouteDurationMin,
            maxDistance: maxRouteDistanceKm
          }}
        />

        {/* Тепловая карта трафика (Mapbox) */}
        <div className={clsx('mt-6 rounded-xl border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white')}>
          <button
            onClick={() => setTrafficHeatmapCollapsed(!isTrafficHeatmapCollapsed)}
            aria-label={isTrafficHeatmapCollapsed ? "Развернуть тепловую карту трафика" : "Свернуть тепловую карту трафика"}
            aria-expanded={!isTrafficHeatmapCollapsed}
            className={clsx(
              'w-full px-4 py-3 flex items-center justify-between transition-colors',
              isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
            )}
          >
            <div className={clsx('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-800')}>
              <span>{isTrafficHeatmapCollapsed ? '▶' : '▼'}</span>
              <span>🚦 Тепловая карта трафика (Mapbox)</span>
              <span className={clsx('text-xs px-2 py-1 rounded-full', isDark ? 'bg-green-900/40 text-green-200' : 'bg-green-100 text-green-700')}>
                Live
              </span>
            </div>
            <div className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-500')}>
              {mapboxTokenState ? 'Токен подключен' : 'Нет токена'}
            </div>
          </button>
          {!isTrafficHeatmapCollapsed && (
            <div className="p-4">
              {!mapboxTokenState && (
                <div className={clsx('mb-3 text-xs px-3 py-2 rounded-lg', isDark ? 'bg-yellow-900/30 text-yellow-200' : 'bg-yellow-50 text-yellow-700')}>
                  ⚠️ Mapbox токен не задан в настройках. Укажите свой токен в разделе Настройки, иначе карта не загрузится.
                </div>
              )}
              {!sectorPathState || sectorPathState.length === 0 ? (
                <div className={clsx('mb-3 text-xs px-3 py-2 rounded-lg', isDark ? 'bg-blue-900/30 text-blue-200' : 'bg-blue-50 text-blue-700')}>
                  ℹ️ Сектор не задан. Тепловая карта будет показывать общую информацию о трафике. Для более точных данных задайте сектор в настройках.
                </div>
              ) : null}
              <Suspense
                fallback={
                  <div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>
                    Загрузка карты трафика...
                  </div>
                }
              >
                <TrafficHeatmap
                  sectorPath={sectorPathState || undefined}
                  sectorName={sectorCityName || 'Сектор'}
                  mapboxToken={mapboxTokenState || ''}
                />
              </Suspense>
            </div>
          )}
        </div>



        {/* Тепловая карта загруженности */}
        {enableWorkloadHeatmap && workloadHeatmapData.length > 0 && (
          <div className={clsx('mt-6 rounded-2xl border-2 overflow-hidden transition-all', isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setWorkloadHeatmapCollapsed(!isWorkloadHeatmapCollapsed)}
              aria-label={isWorkloadHeatmapCollapsed ? "Развернуть тепловую карту загруженности" : "Свернуть тепловую карту загруженности"}
              aria-expanded={!isWorkloadHeatmapCollapsed}
              className={clsx(
                'w-full px-4 py-3 flex items-center justify-between transition-colors',
                isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx('p-2 rounded-lg', isDark ? 'bg-blue-600/20' : 'bg-blue-100')}>
                  <ChartBarIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                  Тепловая карта загруженности
                </span>
              </div>
              <svg
                className={clsx('w-5 h-5 transition-transform', isWorkloadHeatmapCollapsed ? 'rotate-180' : '', isDark ? 'text-gray-400' : 'text-gray-600')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!isWorkloadHeatmapCollapsed && (
              <div className="p-4">
                <Suspense fallback={<div className={clsx('text-sm text-center py-8', isDark ? 'text-gray-400' : 'text-gray-600')}>Загрузка карты загруженности...</div>}>
                  <WorkloadHeatmap
                    orders={workloadHeatmapData}
                    sectorPath={sectorPathState || undefined}
                    onHeatmapDataLoad={(data) => {
                      setWorkloadHeatmapData(data as any)
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {/* Анализ покрытия зоны */}
        <CoverageAnalysisView
          analysis={enableCoverageAnalysis ? coverageAnalysis : null}
          isDark={isDark}
        />

        {(plannedRoutes.length > 0 || (isPlanning === false && excelData && ordersCount > 0 && plannedRoutes.length === 0)) && (
          <div className="mt-6" data-tour="routes">
            <div className={clsx('flex items-center justify-between mb-4 flex-wrap gap-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <div className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                {plannedRoutes.length > 0
                  ? `Сформировано маршрутов: ${plannedRoutes.length}`
                  : 'Маршруты не созданы. Проверьте фильтры и логи в консоли браузера (F12).'}
              </div>
              {plannedRoutes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap" data-tour="analytics">
                  {/* Кнопка аналитики */}
                  <button
                    onClick={() => setShowAnalyticsModal(true)}
                    aria-label="Открыть аналитику маршрутов"
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                      isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
                    )}
                  >
                    <ChartBarIcon className="w-5 h-5" />
                    <span>Аналитика</span>
                  </button>

                  {/* Кнопка истории */}
                  <button
                    onClick={() => {
                      setRouteHistoryEntries(routeHistory.getAll())
                      setShowHistoryModal(true)
                    }}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-medium transition-all hover:scale-105 flex items-center gap-2',
                      isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                    )}
                  >
                    <ClockIcon className="w-5 h-5" />
                    <span>История</span>
                    {routeHistoryEntries.length > 0 && (
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-xs',
                        isDark ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-700'
                      )}>
                        {routeHistoryEntries.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
              <div className="lg:sticky lg:top-8 h-fit">
                <MapSection
                  routes={plannedRoutes}
                  selectedRoute={selectedRoute}
                  onRouteSelect={setSelectedRoute}
                  onOrderClick={setSelectedOrder}
                  isDark={isDark}
                />
              </div>
              <div>
                <Suspense fallback={
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <RouteCardSkeleton />
                    <RouteCardSkeleton />
                    <RouteCardSkeleton />
                    <RouteCardSkeleton />
                  </div>
                }>
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
        {excelData && (
          <ExcelDataPreview
            data={excelData}
            isVisible={showDataPreview}
            onClose={() => setShowDataPreview(false)}
            onConfirm={() => setShowDataPreview(false)}
          />
        )}

        <OrderDetailsModal
          isDark={isDark}
          selectedOrder={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />

        <CourierScheduleModal
          isDark={isDark}
          show={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          schedules={courierSchedules}
          setSchedules={setCourierSchedules}
          editingSchedule={editingSchedule}
          setEditingSchedule={setEditingSchedule}
        />

        <AnalyticsModal
          isOpen={showAnalyticsModal}
          onClose={() => setShowAnalyticsModal(false)}
          isDark={isDark}
          routeAnalytics={routeAnalytics}
        />

        <HistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          isDark={isDark}
          routeHistoryEntries={routeHistoryEntries}
          setRouteHistoryEntries={setRouteHistoryEntries}
          setPlannedRoutes={setPlannedRoutes}
        />

        <RouteDetailModal
          isOpen={!!expandedRouteModal}
          onClose={() => setExpandedRouteModal(null)}
          isDark={isDark}
          route={expandedRouteModal}
          onOrderClick={setSelectedOrder}
        />
      </Suspense>

      {/* Система помощи */}
      {
        showHelpModal && (
          <Suspense fallback={null}>
            <HelpModal
              isOpen={showHelpModal}
              onClose={() => {
                setShowHelpModal(false)
                localStorage.setItem('km_has_seen_help', 'true')
                setHasSeenHelp(true)
              }}
              onStartTour={() => {
                setShowHelpModal(false)
                setTimeout(() => setShowHelpTour(true), 300)
              }}
            />
          </Suspense>
        )
      }

      {/* Интерактивный тур */}
      {
        showHelpTour && (
          <Suspense fallback={null}>
            <HelpTour
              isOpen={showHelpTour}
              onClose={() => {
                setShowHelpTour(false)
                localStorage.setItem('km_has_seen_help', 'true')
                setHasSeenHelp(true)
              }}
              onComplete={() => {
                setShowHelpTour(false)
                localStorage.setItem('km_has_seen_help', 'true')
                setHasSeenHelp(true)
              }}
              steps={[
                {
                  id: 'upload',
                  title: '📤 Загрузка Excel файла',
                  content: `📋 Начните с загрузки файла Excel с данными о заказах.

✅ Обязательные колонки:
• Адрес доставки
• Плановое время доставки
• Время готовности на кухне
• Номер заказа
• Зона доставки`,
                  target: '[data-tour="upload"]',
                  position: 'bottom'
                },
                {
                  id: 'settings',
                  title: '⚙️ Настройки планирования',
                  content: `🎯 Настройте параметры для оптимального планирования маршрутов:

📏 Основные параметры:
• Максимальное количество остановок (рекомендуется 3-5)
• Максимальное расстояние между заказами (км)
• Максимальная разница времени готовности (минуты)

🚦 Режим трафика:
🟢 Свободно - стандартные лимиты
🟡 Плотно - сокращенные маршруты
🔴 Стоим - минимальные маршруты
🤖 Авто - автоматический выбор по данным трафика

💡 Совет: Начните с режима "Авто" для оптимальных результатов`,
                  target: '[data-tour="settings"]',
                  position: 'bottom'
                },
                {
                  id: 'plan',
                  title: '🚀 Планирование маршрутов',
                  content: `✨ После настройки параметров нажмите кнопку "Планировать маршруты"

🔄 Что происходит при планировании:
1️⃣ Система анализирует все заказы
2️⃣ Группирует заказы по зонам и времени
3️⃣ Создает оптимальные маршруты с учетом:
   • Географического расположения
   • Времени готовности заказов
   • Текущего трафика
   • Ограничений по расстоянию

⏱️ Процесс занимает несколько секунд - дождитесь завершения`,
                  target: '[data-tour="plan"]',
                  position: 'top'
                },
                {
                  id: 'routes',
                  title: '🗺️ Просмотр маршрутов',
                  content: `📋 После планирования вы увидите список созданных маршрутов

🖱️ Действия с маршрутом:
• Кликните на маршрут → увидите его на карте
• Разверните → полноэкранный просмотр
• Экспортируйте → Google Maps, Waze или PDF

💡 Совет: Проверьте маршрут на карте перед отправкой курьеру`,
                  target: '[data-tour="routes"]',
                  position: 'top'
                },
                {
                  id: 'analytics',
                  title: '📊 Аналитика маршрутов',
                  content: `📈 Используйте кнопку "Аналитика" для детальной статистики

📊 Что вы увидите:
• Общее количество маршрутов и заказов
• Общее расстояние и время
• Распределение эффективности
• Соответствие временным окнам

💡 Аналитика помогает:
✅ Оценить качество планирования
✅ Найти возможности для оптимизации
✅ Сравнить разные версии маршрутов`,
                  target: '[data-tour="analytics"]',
                  position: 'left'
                },
                {
                  id: 'export',
                  title: '📤 Экспорт маршрутов',
                  content: `🚀 Экспортируйте маршруты для использования в навигации

📍 Google Maps
   → Открывает маршрут в браузере
   → Можно отправить ссылку курьеру

🗺️ Waze
   → Открывает в приложении Waze
   → Удобно для мобильных устройств

📄 PDF
   → Скачивает документ с маршрутом
   → Содержит адреса и порядок доставки

💡 Совет: Используйте Google Maps для просмотра, Waze для навигации`,
                  target: '[data-tour="export"]',
                  position: 'left'
                }
              ] as TourStep[]}
            />
          </Suspense>
        )
      }
    </div >
  )
}

export default AutoPlanner


