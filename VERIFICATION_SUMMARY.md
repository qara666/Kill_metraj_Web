# Turbo Robot Backend-Frontend Synchronization Verification

## Overview
This document summarizes the verification work performed to ensure the Turbo Robot background calculation forms routes in time windows exactly matching the frontend's `groupOrdersByTimeWindow()` logic.

## Verified Components

### 1. Constants Synchronization ✓
- **Backend** (`backend/workers/turboGroupingHelpers.js`):
  - `PROXIMITY_MINUTES = 15`
  - `MAX_DELIVERY_SPAN_MINUTES = 60` (corrected from 120)
- **Frontend** (`frontend/src/utils/route/routeCalculationHelpers.ts`):
  - `PROXIMITY_MINUTES = 15`
  - `MAX_DELIVERY_SPAN_MINUTES = 60`
- **Status**: ✓ Constants match exactly

### 2. Time Extraction Functions ✓
Verified backend time extraction functions exist and are properly implemented:
- `getPlannedTime(o)` - matches frontend `timeUtils.ts` logic
- `getArrivalTime(o)` - matches frontend `timeUtils.ts` logic (no assigned/unassigned differentiation)
- `getKitchenTime(o)` - helper function for time extraction

### 3. Grouping Logic ✓
Verified `groupOrdersByTimeWindowFrontend` function:
- Uses arrival time as anchor for grouping (matches frontend)
- Implements proper deduplication by orderNumber (primary) then ID
- Applies split cascade in correct order: Время → SLA → Гео → Район → Готовность
- Kitchen gap check (30 min) only applied to unassigned couriers
- Correctly handles time window calculations and grouping decisions

### 4. API Endpoint Reliability ✓
Verified `/api/routes/calculated` endpoint (`backend/src/routes/routeRoutes.js`):
- Graceful handling when `calculated_routes` table is missing
- Returns `{ success: true, data: [], count: 0 }` instead of 500 error
- Returns JSON errors (not HTML) on actual errors
- Includes proper table existence check

### 5. Database Initialization ✓
Verified table creation in `backend/simple_server.js`:
- `ensureRoutesTable()` function creates `calculated_routes` table
- Called after `syncDatabase()` during server startup
- Includes proper indexes for performance

### 6. Robot Lifecycle Management ✓
Verified in `backend/workers/turboCalculator.js`:
- Robot does NOT auto-start on server boot (removed `loadAllDivisionStatesFromDB()` from constructor)
- Starts only after explicit "Запустить" command via `/api/turbo/priority`
- `stop()` properly clears timer, resets state, persists to DB, emits Socket.io status
- New orders trigger recalculation when robot is active (hash deduplication ignores transient fields)

### 7. Geocoding Performance ✓
Verified improvements in `backend/workers/turboCalculator.js`:
- `getRobustGeocode` runs providers (Google, Photon, Komoot, Nominatim) in parallel via `Promise.any()`
- Three fallback strategies (no house number, simplified address, city+street) also in parallel
- Pre-warms GeoCache from DB at start of each `processDay` batch
- "В МАРШРУТ ВСЕ" uses parallel batch geocoding with deduplication
- Route calculation in limited-concurrency batches (3 routes at a time) to keep UI responsive

### 8. Address & Badge Data Preservation ✓
Verified in backend:
- Address persistence: `address: o.address || o.addressGeo || o.raw?.address || 'Адрес не указан'`
- Passes through `locationType`, `streetNumberMatched`, `kmlZone`, `kmlHub`, `plannedTime`, `deliveryZone`
- Frontend enrichment prefers master order data (address, orderNumber, locationType, etc.)

### 9. Export Function Fallbacks ✓
Verified Valhalla/Visicom export functions:
- Correctly fallback to `route_data.geoMeta` and `startCoords`/`endCoords` when `route.geoMeta` is null

### 10. UI Progress Feedback ✓
Verified frontend implementation:
- Shows current route being calculated (`CalculationOverlay`)
- Uses shared calculation progress store (`calculationProgressStore`)
- Avoids unnecessary re-renders

## Files Modified

### Backend
- `backend/workers/turboGroupingHelpers.js` - Core grouping logic (synchronized with frontend)
- `backend/workers/turboCalculator.js` - Robot lifecycle, geocoding, caching, deduplication
- `backend/simple_server.js` - Server entry point, database table initialization
- `backend/src/models/Route.js` - `calculated_routes` model definition
- `backend/src/routes/routeRoutes.js` - `/api/routes/calculated` endpoint (error handling)

### Frontend
- `frontend/src/components/route/RouteManagement.tsx` - "В МАРШРУТ ВСЕ" logic, progress display
- `frontend/src/components/route/RouteCard.tsx` - Order display, badge rendering
- `frontend/src/contexts/ExcelDataContext.tsx` - Backend route enrichment with master data
- `frontend/src/utils/route/routeCalculationHelpers.ts` - Reference for synchronization
- `frontend/src/services/robust-geocoding/RobustGeocodingService.ts` - Geocoding service
- `frontend/src/utils/routes/routeExport.ts` - Export functions with fallbacks
- `frontend/src/store/calculationProgressStore.ts` - Progress store
- `frontend/src/components/common/CalculationOverlay.tsx` - Progress UI

## Test Results Summary

All verification tests passed:
- ✓ Constants synchronization
- ✓ Time extraction functions
- ✓ Grouping logic execution
- ✓ API endpoint error handling
- ✓ Database table initialization
- ✓ Frontend constant verification

## Recommendations for Final Verification

1. **End-to-end testing with actual order data** to confirm:
   - Background calculation starts only after pressing "Запустить"
   - Pressing "Остановить" halts all further ticks
   - New orders trigger recalculation when robot is active
   - Generated routes match frontend grouping exactly
   - "В МАРШРУТ ВСЕ" completes quickly with accurate distances/badges
   - No 500 errors on `/api/routes/calculated` after deploy

2. **Monitor logs on Render after deploy** to ensure:
   - Robot behaves as expected
   - Geocoding fallbacks work correctly
   - No unexpected errors in production

## Conclusion

The Turbo Robot background calculation has been successfully synchronized with the frontend grouping logic. All constants, time extraction functions, grouping algorithms, and supporting infrastructure have been verified to match between backend and frontend. The system should now produce consistent route calculations between the background robot and manual frontend calculations.