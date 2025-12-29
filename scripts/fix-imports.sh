#!/bin/bash

# Скрипт для обновления импортов после реорганизации структуры

cd "$(dirname "$0")/.."

# Обновление импортов utils
find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|from '../utils/excelProcessor'|from '../utils/data/excelProcessor'|g" \
  -e "s|from '../utils/htmlProcessor'|from '../utils/data/htmlProcessor'|g" \
  -e "s|from '../utils/dataSharing'|from '../utils/data/dataSharing'|g" \
  -e "s|from '../utils/paymentMethodHelper'|from '../utils/data/paymentMethodHelper'|g" \
  -e "s|from '../utils/logger'|from '../utils/ui/logger'|g" \
  -e "s|from '../utils/notifications'|from '../utils/ui/notifications'|g" \
  -e "s|from '../utils/localStorage'|from '../utils/ui/localStorage'|g" \
  -e "s|from '../utils/routeOptimization'|from '../utils/routes/routeOptimization'|g" \
  -e "s|from '../utils/advancedRouteOptimization'|from '../utils/routes/advancedRouteOptimization'|g" \
  -e "s|from '../utils/trafficAwareOptimization'|from '../utils/routes/trafficAwareOptimization'|g" \
  -e "s|from '../utils/routeOptimizationHelpers'|from '../utils/routes/routeOptimizationHelpers'|g" \
  -e "s|from '../utils/routeOptimizationCache'|from '../utils/routes/routeOptimizationCache'|g" \
  -e "s|from '../utils/routeAnalytics'|from '../utils/routes/routeAnalytics'|g" \
  -e "s|from '../utils/routeEfficiency'|from '../utils/routes/routeEfficiency'|g" \
  -e "s|from '../utils/routeExport'|from '../utils/routes/routeExport'|g" \
  -e "s|from '../utils/routeHistory'|from '../utils/routes/routeHistory'|g" \
  -e "s|from '../utils/courierSchedule'|from '../utils/routes/courierSchedule'|g" \
  -e "s|from '../utils/googleMapsLoader'|from '../utils/maps/googleMapsLoader'|g" \
  -e "s|from '../utils/mapboxLoader'|from '../utils/maps/mapboxLoader'|g" \
  -e "s|from '../utils/mapboxTrafficAPI'|from '../utils/maps/mapboxTrafficAPI'|g" \
  -e "s|from '../utils/ukraineTrafficAPI'|from '../utils/maps/ukraineTrafficAPI'|g" \
  -e "s|from '../utils/coverageAnalysis'|from '../utils/processing/coverageAnalysis'|g" \
  -e "s|from '../utils/apiKeyValidator'|from '../utils/api/apiKeyValidator'|g" \
  -e "s|from '../utils/googleAPIManager'|from '../utils/api/googleAPIManager'|g" \
  {} \;

# Обновление импортов components
find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|from '../components/LoadingSpinner'|from '../components/shared/LoadingSpinner'|g" \
  -e "s|from '../components/LoadingState'|from '../components/shared/LoadingState'|g" \
  -e "s|from '../components/ProgressBar'|from '../components/shared/ProgressBar'|g" \
  -e "s|from '../components/Tooltip'|from '../components/shared/Tooltip'|g" \
  -e "s|from '../components/StatsCard'|from '../components/shared/StatsCard'|g" \
  -e "s|from '../components/Layout'|from '../components/shared/Layout'|g" \
  -e "s|from '../components/AddressEditModal'|from '../components/modals/AddressEditModal'|g" \
  -e "s|from '../components/HelpModal'|from '../components/modals/HelpModal'|g" \
  -e "s|from '../components/HelpModalCouriers'|from '../components/modals/HelpModalCouriers'|g" \
  -e "s|from '../components/HelpModalRoutes'|from '../components/modals/HelpModalRoutes'|g" \
  -e "s|from '../components/ApiKeyNotification'|from '../components/modals/ApiKeyNotification'|g" \
  -e "s|from '../components/ApiKeyStatus'|from '../components/modals/ApiKeyStatus'|g" \
  -e "s|from '../components/RouteMap'|from '../components/maps/RouteMap'|g" \
  -e "s|from '../components/SimpleRouteMap'|from '../components/maps/SimpleRouteMap'|g" \
  -e "s|from '../components/TrafficHeatmap'|from '../components/maps/TrafficHeatmap'|g" \
  -e "s|from '../components/WorkloadHeatmap'|from '../components/maps/WorkloadHeatmap'|g" \
  -e "s|from '../components/ExcelUploadSection'|from '../components/excel/ExcelUploadSection'|g" \
  -e "s|from '../components/ExcelDataPreview'|from '../components/excel/ExcelDataPreview'|g" \
  -e "s|from '../components/ExcelDebugLogs'|from '../components/excel/ExcelDebugLogs'|g" \
  -e "s|from '../components/ExcelResultsDisplay'|from '../components/excel/ExcelResultsDisplay'|g" \
  -e "s|from '../components/FileUpload'|from '../components/excel/FileUpload'|g" \
  -e "s|from '../components/RoutePlanner'|from '../components/route/RoutePlanner'|g" \
  -e "s|from '../components/RouteManagement'|from '../components/route/RouteManagement'|g" \
  -e "s|from '../components/RouteDetailsTabs'|from '../components/route/RouteDetailsTabs'|g" \
  -e "s|from '../components/CourierManagement'|from '../components/courier/CourierManagement'|g" \
  -e "s|from '../components/CourierCard'|from '../components/courier/CourierCard'|g" \
  -e "s|from '../components/AnalyticsDashboard'|from '../components/analytics/AnalyticsDashboard'|g" \
  -e "s|from '../components/ZoneDetails'|from '../components/zone/ZoneDetails'|g" \
  -e "s|from '../components/ZoneStats'|from '../components/zone/ZoneStats'|g" \
  -e "s|from '../components/CitySectorsEditor'|from '../components/zone/CitySectorsEditor'|g" \
  -e "s|from '../components/DataSharing'|from '../components/features/DataSharing'|g" \
  -e "s|from '../components/DataSharingDemo'|from '../components/features/DataSharingDemo'|g" \
  -e "s|from '../components/SyncStatus'|from '../components/features/SyncStatus'|g" \
  -e "s|from '../components/HelpTour'|from '../components/features/HelpTour'|g" \
  {} \;

echo "Импорты обновлены"

