# Анализ функций проекта Kill_metraj_Web

| Файл | Функция | Тип | Строки | Параметры | Предложения |
| ---- | ------- | ---- | ------ | --------- | ------------ |
| backend/src/controllers/UploadController.js | fileFilter | backend | 9 | 3 | Нет явных проблем |
| backend/src/controllers/settingsController.js | createSettingsVersion | backend | 17 | 4 | Сократить количество параметров |
| backend/src/controllers/settingsController.js | getUserActivityData | backend | 19 | 1 | Нет явных проблем |
| backend/src/middleware/notFound.js | notFound | backend | 5 | 3 | Нет явных проблем |
| backend/src/middleware/rateLimiter.js | createRateLimiter | backend | 19 | 3 | Нет явных проблем |
| backend/src/services/ExcelService.js | includesAny | backend | 5 | 2 | Нет явных проблем |
| backend/src/services/ExcelService_v2.js | includesAny | backend | 3 | 2 | Нет явных проблем |
| backend/src/services/TelegramService.js | normalize | backend | 1 | 1 | Нет явных проблем |
| backend/src/utils/validators/settingsValidator.js | validateSettingsAgainstSchema | backend | 37 | 2 | Нет явных проблем |
| frontend/src/App.tsx | App | other | 21 | 0 | Нет явных проблем |
| frontend/src/components/AIFeatures.tsx | AIFeatures | component | 243 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/AIFeatures.tsx | loadModel | component | 5 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/ExcelTemplates.tsx | ExcelTemplates | component | 184 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/ExcelTemplates.tsx | handleDownloadTemplate | component | 34 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ExcelTemplates.tsx | createSampleData | component | 18 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/MonitoringSystem.tsx | MonitoringSystem | component | 139 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/MonitoringSystem.tsx | calculateDistance | component | 7 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | SmartRouteOptimizer | component | 540 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | optimizeSingleRoute | component | 21 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | optimizeOrderSequence | component | 30 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | calculateDistance | component | 15 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | calculateRouteDistance | component | 14 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | calculateRouteDuration | component | 10 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | calculateImprovements | component | 13 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/SmartRouteOptimizer.tsx | generateSuggestions | component | 22 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/VisualizationDashboard.tsx | VisualizationDashboard | component | 724 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/VisualizationDashboard.tsx | SimpleChart | component | 29 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/VisualizationDashboard.tsx | SimpleMap | component | 57 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIDemandForecast.tsx | AIDemandForecast | component | 43 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIDemandForecast.tsx | ForecastFactor | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIEfficiencyAnalysis.tsx | AIEfficiencyAnalysis | component | 50 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIEfficiencyAnalysis.tsx | FactorStat | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIFeatureActions.tsx | AIFeatureActions | component | 93 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIFeatureActions.tsx | FeatureInfoCard | component | 9 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIHeader.tsx | AIHeader | component | 34 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIModelStatus.tsx | AIModelStatus | component | 67 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIPredictionsList.tsx | AIPredictionsList | component | 80 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/ai/AIPredictionsList.tsx | StatBox | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | AnalyticsDashboard | component | 529 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | calculatePerformanceScore | component | 6 | 3 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | generatePredictions | component | 20 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | analyzeEfficiency | component | 12 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | analyzeLoadBalancing | component | 13 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | calculateBalanceScore | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | generateImprovementSuggestions | component | 23 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/analytics/AnalyticsDashboard.tsx | generateLoadBalancingRecommendations | component | 17 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierCard.tsx | CourierCard | component | 123 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierCard.tsx | formatDistance | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierCard.tsx | getVehicleIcon | component | 3 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierCard.tsx | getStatusColor | component | 3 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | CourierManagement | component | 1576 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | searchCouriers | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | handleDeleteCourier | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | toggleCourierStatus | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | toggleCourierVehicleType | component | 45 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | getCourierRoutes | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | handleEditAddress | component | 4 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | handleSaveAddress | component | 58 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | handleRecalculateRoute | component | 17 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | openRouteInGoogleMaps | component | 20 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | hasCoords | component | 1 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | deleteRoute | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | confirmDeleteRoute | component | 29 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | cancelDeleteRoute | component | 4 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | formatDuration | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | handleDistanceClick | component | 4 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/courier/CourierManagement.tsx | recalculateCourierRoute | component | 131 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelDataPreview.tsx | ExcelDataPreview | component | 213 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelDebugLogs.tsx | ExcelDebugLogs | component | 21 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelResultsDisplay.tsx | ExcelResultsDisplay | component | 287 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelResultsDisplay.tsx | toggleSection | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelResultsDisplay.tsx | sortCouriers | component | 19 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelResultsDisplay.tsx | handleCourierSort | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelUploadSection.tsx | ExcelUploadSection | component | 500 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelUploadSection.tsx | formatFileSize | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/ExcelUploadSection.tsx | getFileIcon | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/FileUpload.tsx | FileUpload | component | 121 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/excel/FileUpload.tsx | removeFile | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/excel/FileUpload.tsx | formatFileSize | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | DataSharing | component | 477 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | checkForSharedData | component | 12 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | handleShare | component | 42 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | handleCopyUrl | component | 15 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | handleImport | component | 87 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | handleCloseShareModal | component | 5 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharing.tsx | handleCloseImportModal | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharingDemo.tsx | DataSharingDemo | component | 273 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharingDemo.tsx | generateDemoData | component | 62 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharingDemo.tsx | handleGenerateDemo | component | 11 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/DataSharingDemo.tsx | handleCopyDemo | component | 15 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | HelpTour | component | 1540 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | findAndPositionElement | component | 165 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleUpdate | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleResize | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleScroll | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleKey | component | 17 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleNext | component | 8 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handlePrev | component | 5 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | handleSkip | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/HelpTour.tsx | renderDemoExample | component | 1004 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | SyncStatus | component | 154 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | handleOnline | component | 1 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | handleOffline | component | 1 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | handleStorageChange | component | 16 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | formatLastSync | component | 20 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | getStatusIcon | component | 16 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | getStatusText | component | 18 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/features/SyncStatus.tsx | getStatusColor | component | 15 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/SimpleRouteMap.tsx | SimpleRouteMap | component | 148 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/maps/SimpleRouteMap.tsx | handleRouteClick | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | updateMetrics | component | 25 | 3 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | getRefreshInterval | component | 1 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | getAdaptiveDensity | component | 6 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | isPointInPolygon | component | 17 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | generateGridPoints | component | 36 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | buildGridPairs | component | 21 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | getPolygonBounds | component | 10 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | pickRandomPointInside | component | 15 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | generateInteriorChords | component | 81 | 2 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | sampleRouteSegments | component | 12 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | buildPairKeyFromLatLng | component | 2 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | buildPairKeyFromCoords | component | 2 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | getTrafficMood | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | clusterPoints | component | 47 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | TrafficHeatmap | component | 1705 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | safeNumber | component | 1 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | animateCritical | component | 19 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | init | component | 44 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/TrafficHeatmap.tsx | toggleFilter | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/maps/WorkloadHeatmap.tsx | initMap | component | 102 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/modals/AddressEditModal.tsx | AddressEditModal | component | 372 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/modals/AddressEditModal.tsx | handleGeocode | component | 28 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/modals/AddressEditModal.tsx | handleSave | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/modals/AddressEditModal.tsx | handleCancel | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/modals/AddressEditModal.tsx | handleKeyPress | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/modals/ApiKeyNotification.tsx | ApiKeyNotification | component | 75 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/modals/ApiKeyStatus.tsx | ApiKeyStatus | component | 30 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/modals/HelpModal.tsx | HelpModal | component | 429 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/modals/HelpModalCouriers.tsx | HelpModalCouriers | component | 306 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/modals/HelpModalRoutes.tsx | HelpModalRoutes | component | 301 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringAlerts.tsx | MonitoringAlerts | component | 71 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringAlerts.tsx | AlertItem | component | 72 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringAlerts.tsx | getAlertTypeLabel | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringAlerts.tsx | getSeverityLabel | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringCourierTracking.tsx | MonitoringCourierTracking | component | 63 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringCourierTracking.tsx | getStatusLabel | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringGeofences.tsx | MonitoringGeofences | component | 93 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringGeofences.tsx | getGeofenceTypeLabel | component | 8 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringHeader.tsx | MonitoringHeader | component | 62 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringStatsView.tsx | MonitoringStatsView | component | 42 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/monitoring/MonitoringStatsView.tsx | StatCard | component | 20 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteDetailsTabs.tsx | RouteDetailsTabs | component | 434 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | RouteManagement | component | 2230 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | initGoogleMaps | component | 16 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | getAvailableOrdersCount | component | 16 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | getCourierVehicleType | component | 11 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | sortOrdersByTime | component | 16 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | isRouteDuplicate | component | 14 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | isOrderInExistingRoute | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | MeasuredRow | component | 31 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | measure | component | 1 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | createRoute | component | 77 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | cleanAddress | component | 11 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | calculateRouteDistance | component | 542 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | toLatLng | component | 1 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | extractHouseNumber | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | extractPostal | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | generateStreetVariants | component | 48 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | replaceTokens | component | 5 | 3 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | scoreCandidate | component | 44 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | geocodeWithSector | component | 51 | 2 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | tryRefine | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | geocodeInsideOnly | component | 73 | 2 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | buildMeta | component | 17 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | isInside | component | 1 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | deleteRoute | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | confirmDeleteRoute | component | 7 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | cancelDeleteRoute | component | 4 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | handleEditAddress | component | 4 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | handleSaveAddress | component | 35 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | recalculateRoute | component | 19 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | clearAllRoutes | component | 14 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | openRouteInGoogleMaps | component | 34 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | hasFullCoords | component | 1 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | formatDuration | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | formatDistance | component | 5 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RouteManagement.tsx | translateLocationType | component | 10 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | RoutePlanner | component | 583 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | isOrderInExistingRoute | component | 6 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | calculateRouteDistance | component | 14 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | calculateRouteDuration | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | calculateDistance | component | 13 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | findRouteIntersection | component | 14 | 2 | Добавить/проверить типизацию Props |
| frontend/src/components/route/RoutePlanner.tsx | applySuggestion | component | 4 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/shared/Layout.tsx | Layout | component | 220 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/shared/LoadingSpinner.tsx | LoadingSpinner | component | 47 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/shared/LoadingState.tsx | LoadingState | component | 56 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/shared/ProgressBar.tsx | ProgressBar | component | 67 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/shared/StatsCard.tsx | StatsCard | component | 38 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/shared/Tooltip.tsx | Tooltip | component | 155 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/shared/Tooltip.tsx | showTooltip | component | 9 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/shared/Tooltip.tsx | hideTooltip | component | 6 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/shared/Tooltip.tsx | updateTooltipPosition | component | 49 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/CitySectorsEditor.tsx | CitySectorsEditor | component | 134 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/zone/CitySectorsEditor.tsx | init | component | 73 | 0 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/zone/CitySectorsEditor.tsx | persist | component | 11 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | ZoneDetails | component | 377 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | toggleOrderSelection | component | 7 | 1 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | selectAllOrders | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | clearSelection | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | getSelectedOrdersData | component | 3 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneDetails.tsx | calculateRouteStats | component | 13 | 0 | Добавить/проверить типизацию Props |
| frontend/src/components/zone/ZoneStats.tsx | ZoneStats | component | 256 | 1 | Разбить на более мелкие функции; Добавить/проверить типизацию Props |
| frontend/src/contexts/ExcelDataContext.tsx | useExcelData | other | 7 | 0 | Нет явных проблем |
| frontend/src/contexts/ExcelDataContext.tsx | ExcelDataProvider | other | 79 | 1 | Разбить на более мелкие функции |
| frontend/src/contexts/ExcelDataContext.tsx | setExcelData | other | 11 | 1 | Нет явных проблем |
| frontend/src/contexts/ExcelDataContext.tsx | updateExcelData | other | 12 | 1 | Нет явных проблем |
| frontend/src/contexts/ExcelDataContext.tsx | clearExcelData | other | 5 | 0 | Нет явных проблем |
| frontend/src/contexts/ExcelDataContext.tsx | updateRouteData | other | 12 | 1 | Нет явных проблем |
| frontend/src/contexts/ExcelDataContext.tsx | applyCourierVehicleMap | other | 26 | 1 | Нет явных проблем |
| frontend/src/contexts/ThemeContext.tsx | ThemeProvider | other | 25 | 1 | Нет явных проблем |
| frontend/src/contexts/ThemeContext.tsx | toggleTheme | other | 3 | 0 | Нет явных проблем |
| frontend/src/contexts/ThemeContext.tsx | useTheme | other | 7 | 0 | Нет явных проблем |
| frontend/src/hooks/useApiKey.ts | useApiKey | hook | 17 | 0 | Убедиться в соблюдении правил хуков |
| frontend/src/hooks/useApiKey.ts | checkApiKey | hook | 4 | 0 | Убедиться в соблюдении правил хуков |
| frontend/src/hooks/useCloudSync.ts | useCloudSync | hook | 49 | 0 | Убедиться в соблюдении правил хуков |
| frontend/src/hooks/useCloudSync.ts | checkConnection | hook | 8 | 0 | Убедиться в соблюдении правил хуков |
| frontend/src/hooks/useDataSync.ts | useDataSync | hook | 12 | 0 | Убедиться в соблюдении правил хуков |
| frontend/src/pages/Analytics.tsx | Analytics | other | 60 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | toRadians | other | 1 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | toDegrees | other | 1 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | normalizeAngle | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | bearingBetween | other | 10 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | circularAverage | other | 12 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | angularDifference | other | 4 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | bucketFromBearing | other | 5 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | bucketDifference | other | 4 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | updateDirectionTracker | other | 5 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | isDirectionCompatible | other | 12 | 3 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | isBucketCompatible | other | 9 | 3 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | presetTemplate | other | 33 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | deriveTrafficPreset | other | 37 | 3 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | getAutoMode | other | 9 | 0 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | RouteMap | other | 282 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | initMap | other | 236 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | geocodeAddress | other | 17 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | getOrderCoordinates | other | 16 | 2 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | AutoPlanner | other | 8677 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | loadSnapshot | other | 16 | 0 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | handleStorage | other | 5 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | handleCustom | other | 6 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | handleSettingsUpdated | other | 3 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | handleStorage | other | 6 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | handleVisibilityChange | other | 5 | 0 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | cleanAddress | other | 7 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | normalizeAddr | other | 10 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | isUrgentOrder | other | 12 | 3 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | generateStreetVariants | other | 43 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | getSectorCenter | other | 10 | 0 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | isInsideSector | other | 177 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | geocodeAddress | other | 3 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | geocodeLocation | other | 3 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | parseTime | other | 139 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getKitchenTime | other | 439 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getPlannedTime | other | 440 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | isValidAddress | other | 48 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | getCoordinates | other | 60 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | quickEvaluateCandidate | other | 128 | 4 | Разбить на более мелкие функции; Сократить количество параметров |
| frontend/src/pages/AutoPlanner.tsx | checkChainFeasible | other | 60 | 2 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getOrderId | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | filterRemaining | other | 3 | 0 | Нет явных проблем |
| frontend/src/pages/AutoPlanner.tsx | parseTime | other | 69 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getKitchenTime | other | 65 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getPlannedTime | other | 72 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | parseTime | other | 94 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getKitchenTime | other | 136 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | getPlannedTime | other | 62 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | parseTimeLocal | other | 217 | 3 | Разбить на более мелкие функции |
| frontend/src/pages/AutoPlanner.tsx | parseTimeLocal | other | 71 | 2 | Разбить на более мелкие функции |
| frontend/src/pages/Couriers.tsx | Couriers | other | 7 | 0 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | Dashboard | other | 597 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/Dashboard.tsx | log | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | mergeExcelData | other | 140 | 2 | Разбить на более мелкие функции |
| frontend/src/pages/Dashboard.tsx | loadFastopertorData | other | 48 | 0 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | handleExcelFileSelect | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | handleExcelProcessFile | other | 6 | 0 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | handleClearExcelResults | other | 14 | 0 | Нет явных проблем |
| frontend/src/pages/Dashboard.tsx | handleHtmlDataLoad | other | 85 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/Dashboard.tsx | handleConfirmPreview | other | 5 | 0 | Нет явных проблем |
| frontend/src/pages/Routes.tsx | Routes | other | 7 | 0 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | CourierVehicleEditor | other | 139 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/Settings.tsx | toggleType | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | CollapsibleSection | other | 63 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/Settings.tsx | CityBiasSection | other | 79 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/Settings.tsx | Settings | other | 586 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/Settings.tsx | checkApiKeyStatus | other | 17 | 1 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | testApiKey | other | 27 | 0 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | validateFastopertorApi | other | 34 | 0 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | onSubmit | other | 20 | 1 | Нет явных проблем |
| frontend/src/pages/Settings.tsx | handleClearAllData | other | 34 | 0 | Нет явных проблем |
| frontend/src/pages/TelegramParsing.tsx | TelegramParsing | other | 1239 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/TelegramParsing.tsx | checkStatusAndRestore | other | 39 | 0 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | Zones | other | 1101 | 0 | Разбить на более мелкие функции |
| frontend/src/pages/Zones.tsx | addLog | other | 4 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | processExcelFile | other | 50 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | processZoneExcelData | other | 109 | 1 | Разбить на более мелкие функции |
| frontend/src/pages/Zones.tsx | isLikelyAddress | other | 10 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | extractAddress | other | 17 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | determineCourierType | other | 21 | 2 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | handleFileUpload | other | 6 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | getZoneCenter | other | 11 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | handleCreateRoute | other | 39 | 2 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | calculateRouteDistance | other | 6 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | calculateRouteTime | other | 6 | 1 | Нет явных проблем |
| frontend/src/pages/Zones.tsx | calculateRouteEfficiency | other | 5 | 1 | Нет явных проблем |
| frontend/src/utils/api/apiKeyValidator.ts | validateApiKey | util | 8 | 1 | Нет явных проблем |
| frontend/src/utils/api/apiKeyValidator.ts | formatApiKey | util | 4 | 1 | Нет явных проблем |
| frontend/src/utils/api/googleAPIManager.ts | generatePointPairKey | util | 3 | 2 | Нет явных проблем |
| frontend/src/utils/api/googleAPIManager.ts | generateRouteKey | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/api/googleAPIManager.ts | getCachedPointPair | util | 36 | 2 | Нет явных проблем |
| frontend/src/utils/api/googleAPIManager.ts | cachePointPair | util | 25 | 5 | Сократить количество параметров |
| frontend/src/utils/api/googleAPIManager.ts | smartCacheCheck | util | 68 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/api/googleAPIManager.ts | cacheRouteResult | util | 41 | 2 | Нет явных проблем |
| frontend/src/utils/api/googleAPIManager.ts | quickFeasibilityCheck | util | 43 | 3 | Нет явных проблем |
| frontend/src/utils/data/dataSharing.ts | useDataSharing | util | 47 | 0 | Нет явных проблем |
| frontend/src/utils/data/dataSharing.ts | shareData | util | 9 | 2 | Нет явных проблем |
| frontend/src/utils/data/dataSharing.ts | importDataFromUrl | util | 3 | 1 | Нет явных проблем |
| frontend/src/utils/data/dataSharing.ts | copyToClipboard | util | 24 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | processExcelFile | util | 9 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | processCsvFile | util | 40 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | processExcelFileInternal | util | 43 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | processJsonData | util | 538 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | isValidAddress | util | 70 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | createRowData | util | 86 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | isOrderRow | util | 7 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | isCourierRow | util | 6 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | isPaymentMethodRow | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | hasValue | util | 11 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | createOrder | util | 406 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | isValidAddress | util | 46 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | getFieldByKeywords | util | 17 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | createCourier | util | 10 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | createPaymentMethod | util | 8 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | getValue | util | 14 | 2 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | findOrderNumber | util | 12 | 1 | Нет явных проблем |
| frontend/src/utils/data/excelProcessor.ts | createOrderFromData | util | 160 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | isValidAddress | util | 52 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/data/excelProcessor.ts | getFieldByKeywords | util | 17 | 2 | Нет явных проблем |
| frontend/src/utils/data/htmlProcessor.ts | extractCellText | util | 18 | 1 | Нет явных проблем |
| frontend/src/utils/data/htmlProcessor.ts | parseHtmlTableToJson | util | 114 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/data/htmlProcessor.ts | processHtmlUrl | util | 43 | 1 | Нет явных проблем |
| frontend/src/utils/data/htmlProcessor.ts | isValidUrl | util | 8 | 1 | Нет явных проблем |
| frontend/src/utils/data/htmlProcessor.ts | detectCharsetFromHtml | util | 9 | 1 | Нет явных проблем |
| frontend/src/utils/data/htmlProcessor.ts | decodeHtmlWithCharset | util | 52 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/data/htmlProcessor.ts | processHtmlFile | util | 28 | 1 | Нет явных проблем |
| frontend/src/utils/data/paymentMethodHelper.ts | getPaymentMethodBadgeProps | util | 32 | 2 | Нет явных проблем |
| frontend/src/utils/maps/mapboxLoader.ts | ensureCssLoaded | util | 11 | 0 | Нет явных проблем |
| frontend/src/utils/maps/mapboxLoader.ts | loadViaCdn | util | 18 | 0 | Нет явных проблем |
| frontend/src/utils/maps/mapboxLoader.ts | loadMapboxGL | util | 25 | 0 | Нет явных проблем |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | getMapboxTraffic | util | 71 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | getMapboxTrafficForSegment | util | 7 | 3 | Нет явных проблем |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | getTrafficSeverity | util | 6 | 1 | Нет явных проблем |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | calculateTrafficDelay | util | 7 | 2 | Нет явных проблем |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | getTrafficColor | util | 14 | 1 | Нет явных проблем |
| frontend/src/utils/maps/mapboxTrafficAPI.ts | getTrafficDescription | util | 14 | 1 | Нет явных проблем |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | getHistoricalTraffic | util | 27 | 4 | Сократить количество параметров |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | saveTrafficPattern | util | 28 | 5 | Сократить количество параметров |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | getUkraineTrafficForRoute | util | 78 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | getUkraineTrafficForSegment | util | 13 | 3 | Нет явных проблем |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | getUkraineTrafficForOrders | util | 24 | 2 | Нет явных проблем |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | calculateTotalTrafficDelay | util | 3 | 1 | Нет явных проблем |
| frontend/src/utils/maps/ukraineTrafficAPI.ts | hasCriticalTraffic | util | 3 | 1 | Нет явных проблем |
| frontend/src/utils/optimizationProfiles.ts | getOptimizationSettings | util | 3 | 0 | Нет явных проблем |
| frontend/src/utils/optimizationProfiles.ts | createCustomProfile | util | 30 | 3 | Нет явных проблем |
| frontend/src/utils/optimizationProfiles.ts | compareProfiles | util | 31 | 2 | Нет явных проблем |
| frontend/src/utils/performance.ts | debounce | util | 18 | 2 | Нет явных проблем |
| frontend/src/utils/performance.ts | later | util | 4 | 0 | Нет явных проблем |
| frontend/src/utils/performance.ts | throttle | util | 16 | 2 | Нет явных проблем |
| frontend/src/utils/performance.ts | memoizeWithTTL | util | 33 | 2 | Нет явных проблем |
| frontend/src/utils/performance.ts | lazyLoad | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/performance.ts | useVirtualization | util | 30 | 2 | Нет явных проблем |
| frontend/src/utils/processing/coverageAnalysis.ts | haversineDistance | util | 10 | 4 | Сократить количество параметров |
| frontend/src/utils/processing/coverageAnalysis.ts | isPointInPolygon | util | 19 | 2 | Нет явных проблем |
| frontend/src/utils/processing/coverageAnalysis.ts | isPointInSector | util | 10 | 2 | Нет явных проблем |
| frontend/src/utils/processing/coverageAnalysis.ts | analyzeCoverage | util | 58 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/processing/coverageAnalysis.ts | identifyCoverageGaps | util | 76 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/processing/coverageAnalysis.ts | generateRecommendations | util | 30 | 3 | Нет явных проблем |
| frontend/src/utils/processing/coverageAnalysis.ts | createWorkloadHeatmap | util | 88 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/processing/coverageAnalysis.ts | analyzeCoverageByRoutes | util | 12 | 2 | Нет явных проблем |
| frontend/src/utils/processing/coverageAnalysis.ts | generateCoverageReport | util | 31 | 1 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | analyzeDistribution | util | 50 | 1 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | analyzeRoute | util | 61 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/routeDistributionOptimizer.ts | selectOrdersToMove | util | 11 | 2 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | calculateCompatibilityScore | util | 30 | 3 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | groupOrdersByTimeWindows | util | 28 | 2 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | getAverageReadyTime | util | 8 | 1 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | updateRouteFromOrders | util | 24 | 3 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | getOrderId | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | calculateImprovementScore | util | 9 | 2 | Нет явных проблем |
| frontend/src/utils/routeDistributionOptimizer.ts | improveRouteDistributionAdvanced | util | 111 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routePlanningIntegration.ts | planEnhancedRoutes | util | 192 | 4 | Разбить на более мелкие функции; Сократить количество параметров |
| frontend/src/utils/routePlanningIntegration.ts | quickPlanRoutes | util | 14 | 3 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | haversineDistance | util | 10 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/advancedRouteOptimization.ts | calculateRouteDistance | util | 20 | 1 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | calculateRouteScore | util | 22 | 1 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | nearestNeighborOptimization | util | 83 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | geneticAlgorithmOptimization | util | 153 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | generatePopulation | util | 14 | 1 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | fitness | util | 3 | 1 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | crossover | util | 26 | 2 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | mutate | util | 13 | 1 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | tournamentSelection | util | 13 | 2 | Нет явных проблем |
| frontend/src/utils/routes/advancedRouteOptimization.ts | simulatedAnnealingOptimization | util | 71 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | twoOptOptimization | util | 60 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | threeOptOptimization | util | 78 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | antColonyOptimization | util | 159 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/advancedRouteOptimization.ts | multiAlgorithmOptimization | util | 89 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/courierSchedule.ts | getCourierStartTime | util | 15 | 2 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | isCourierAvailable | util | 21 | 2 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | parseTime | util | 4 | 1 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | getCourierStartTimesForDay | util | 22 | 2 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | countAvailableCouriers | util | 12 | 2 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | assignRouteToCourier | util | 188 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/courierSchedule.ts | filterRoutesByCourierType | util | 37 | 3 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | createDefaultSchedule | util | 25 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/courierSchedule.ts | parseTimeFromExcel | util | 44 | 1 | Нет явных проблем |
| frontend/src/utils/routes/courierSchedule.ts | parseCourierScheduleFromExcel | util | 149 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeAnalytics.ts | calculateRouteAnalytics | util | 144 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeAnalytics.ts | getEmptyAnalytics | util | 35 | 0 | Нет явных проблем |
| frontend/src/utils/routes/routeAnalytics.ts | calculateDistance | util | 14 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeEfficiency.ts | calculateRouteEfficiencyMetrics | util | 47 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeEfficiency.ts | improveRouteDistribution | util | 80 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeEfficiency.ts | optimizeRouteOrder | util | 33 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeEfficiency.ts | groupOrdersByZones | util | 13 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeEfficiency.ts | suggestRouteImprovements | util | 25 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToGoogleMaps | util | 19 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToWaze | util | 14 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToText | util | 29 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToJSON | util | 25 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToCSV | util | 16 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | downloadFile | util | 11 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | exportToPDF | util | 18 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeExport.ts | generatePDFHTML | util | 63 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeHistory.ts | minimizeRoutes | util | 43 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeHistory.ts | checkStorageSize | util | 8 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | calculateOrderPriority | util | 61 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | calculateGroupingEfficiency | util | 60 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | shouldCombineOrders | util | 174 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | combineOrders | util | 171 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | splitLargeRoute | util | 83 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | sortByPriority | util | 16 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | clusterOrdersByLocation | util | 57 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimization.ts | haversineDistance | util | 10 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/routeOptimization.ts | normalizeAddressForComparison | util | 7 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | areAddressesSameBuilding | util | 24 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | extractMainAddress | util | 8 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | calculateSimilarity | util | 9 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimization.ts | levenshteinDistance | util | 27 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | haversineDistance | util | 15 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | getCachedDistance | util | 16 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | findClusters | util | 43 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | groupOrdersByZone | util | 13 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateRouteEfficiency | util | 33 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | isReadyTimeCompatible | util | 28 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | filterByReadyTimeCompatibility | util | 13 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | isReadyTimeCompatibleV2 | util | 27 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | groupOrdersByReadyTimeWindows | util | 47 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | parseKitchenTime | util | 25 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | estimateReadyAt | util | 26 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateClusterDensity | util | 20 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | getAverageReadyTime | util | 11 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | getReadyTimeSpread | util | 14 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | extractZoneFromAddress | util | 22 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | groupOrdersByDeliveryZones | util | 39 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateAverageDistanceBetweenZones | util | 22 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | isUrgent | util | 5 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateOrderPriority | util | 47 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateIsolation | util | 24 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateOrderDensity | util | 24 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | prioritizeDenseClusters | util | 23 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | preallocateOrdersToRoutes | util | 44 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateTimeCompatibility | util | 20 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | enhancedCandidateEvaluation | util | 47 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | findBestOrderToMove | util | 25 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | moveOrderBetweenRoutes | util | 11 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | canMergeRoutes | util | 24 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | mergeRoutes | util | 7 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | rebalanceRoutes | util | 70 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | estimateMaxRoutes | util | 5 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | generateRouteCacheKey | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | getCachedRouteFeasibility | util | 23 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | cacheRouteFeasibility | util | 25 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | prefilterCandidatesByDistance | util | 14 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateReturnDistance | util | 7 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | enhancedCandidateEvaluationV2 | util | 334 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | toRadians | util | 1 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | toDegrees | util | 1 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | bearingBetween | util | 11 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | normalizeAngle | util | 5 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | angularDifference | util | 4 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateRouteMetrics | util | 28 | 2 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | rebalanceRoutesV2 | util | 89 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | globalRouteOptimization | util | 163 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | rebalanceRoutesV3 | util | 171 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | canMergeRoutesWithTime | util | 13 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | getAdaptivePriorityWeights | util | 46 | 1 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateClusterPriority | util | 33 | 3 | Нет явных проблем |
| frontend/src/utils/routes/routeOptimizationHelpers.ts | calculateOrderPriorityV2 | util | 65 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/trafficAwareOptimization.ts | haversineDistance | util | 10 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/trafficAwareOptimization.ts | isInCongestionArea | util | 19 | 2 | Нет явных проблем |
| frontend/src/utils/routes/trafficAwareOptimization.ts | calculateTrafficDelay | util | 32 | 4 | Сократить количество параметров |
| frontend/src/utils/routes/trafficAwareOptimization.ts | adjustRouteForTraffic | util | 46 | 3 | Нет явных проблем |
| frontend/src/utils/routes/trafficAwareOptimization.ts | avoidCongestionAreas | util | 44 | 2 | Нет явных проблем |
| frontend/src/utils/routes/trafficAwareOptimization.ts | optimizeWithTraffic | util | 27 | 3 | Нет явных проблем |
| frontend/src/utils/routes/trafficAwareOptimization.ts | predictCongestion | util | 59 | 3 | Разбить на более мелкие функции |
| frontend/src/utils/routes/trafficAwareOptimization.ts | batchOrdersByTime | util | 123 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/routes/trafficAwareOptimization.ts | splitLargeBatch | util | 17 | 2 | Нет явных проблем |
| frontend/src/utils/routes/trafficAwareOptimization.ts | createOptimalBatches | util | 16 | 2 | Нет явных проблем |
| frontend/src/utils/ui/notifications.ts | generateRouteNotifications | util | 68 | 2 | Разбить на более мелкие функции |
| frontend/src/utils/ui/notifications.ts | calculateOrderETAs | util | 53 | 1 | Разбить на более мелкие функции |
| frontend/src/utils/ui/notifications.ts | generateDeadlineRiskMessage | util | 4 | 2 | Нет явных проблем |
| frontend/src/utils/ui/notifications.ts | generateDelayWarningMessage | util | 4 | 2 | Нет явных проблем |
| frontend/src/utils/ui/notifications.ts | scheduleNotifications | util | 28 | 2 | Нет явных проблем |
| frontend/src/utils/ui/notifications.ts | formatNotificationForDisplay | util | 34 | 1 | Нет явных проблем |
