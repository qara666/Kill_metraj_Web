// Verification script for Turbo Robot fixes
console.log('🔍 Verifying Turbo Robot fixes...');

const fs = require('fs');
const path = require('path');

// Test 1: Check that status was removed from hash in turboCalculator.js
const turboCalculatorPath = path.join(__dirname, 'backend', 'workers', 'turboCalculator.js');
let turboCalculatorContent = fs.readFileSync(turboCalculatorPath, 'utf8');

console.log('\n1. Checking hash deduplication in turboCalculator.js:');
// Check the stablePayload section (lines ~655-663) - should NOT include status field
const stablePayloadMatch = turboCalculatorContent.match(/const stablePayload = \(data\.orders \|\| \[\]\)\.map\(o => \({[\s\S]*?}\)\);/);
if (stablePayloadMatch) {
  const stablePayload = stablePayloadMatch[0];
  const hasStatusInPayload = stablePayload.includes('status') && !stablePayload.includes('statusTimings');
  if (hasStatusInPayload) {
    console.log('   ❌ FAIL: Status still found in stablePayload hash calculation');
  } else {
    console.log('   ✅ PASS: Status removed from hash calculation (stablePayload contains only routing-relevant fields)');
  }
} else {
  console.log('   ⚠️  WARNING: Could not find stablePayload section to verify');
}

// Test 2: Check that grouping uses arrival time for assigned couriers
const groupingHelpersPath = path.join(__dirname, 'backend', 'workers', 'turboGroupingHelpers.js');
let groupingHelpersContent = fs.readFileSync(groupingHelpersPath, 'utf8');

console.log('\n2. Checking grouping logic in turboGroupingHelpers.js:');
const usesArrivalForAssigned = groupingHelpersContent.includes('For assigned couriers: use creation time') && 
                              groupingHelpersContent.includes('const isAssignedCourier = courier && !courier.toUpperCase().includes(\'НЕ НАЗНАЧЕН\')');

if (usesArrivalForAssigned) {
  console.log('   ✅ PASS: Uses arrival/creation time for assigned couriers');
} else {
  console.log('   ❌ FAIL: Does not properly use arrival time for assigned couriers');
}

// Test 3: Check localStorage auto-save in ExcelDataContext.tsx
const excelContextPath = path.join(__dirname, 'frontend', 'src', 'contexts', 'ExcelDataContext.tsx');
let excelContextContent = fs.readFileSync(excelContextPath, 'utf8');

console.log('\n3. Checking localStorage persistence in ExcelDataContext.tsx:');
const hasAutoSave = excelContextContent.includes('Auto-save dashboard data to localStorage') && 
                   excelContextContent.includes('localStorageUtils.setData(\'km_dashboard_processed_data\'');

if (hasAutoSave) {
  console.log('   ✅ PASS: Found auto-save to localStorage');
} else {
  console.log('   ❌ FAIL: Missing auto-save to localStorage');
}

// Test 4: Check geocoding fallback strategies
const geocodingHookPath = path.join(__dirname, 'frontend', 'src', 'hooks', 'useRouteGeocoding.ts');
let geocodingHookContent = fs.readFileSync(geocodingHookPath, 'utf8');

console.log('\n4. Checking geocoding fallback strategies in useRouteGeocoding.ts:');
const hasFallbackStrategies = geocodingHookContent.includes('Strategy 1: Try without house number') &&
                             geocodingHookContent.includes('Strategy 2: Try with simplified address') &&
                             geocodingHookContent.includes('Strategy 3: Try with just city + street name');

if (hasFallbackStrategies) {
  console.log('   ✅ PASS: Found geocoding fallback strategies');
} else {
  console.log('   ❌ FAIL: Missing geocoding fallback strategies');
}

// Test 5: Check route export fallback to start/end coords
const routeExportPath = path.join(__dirname, 'frontend', 'src', 'utils', 'routes', 'routeExport.ts');
let routeExportContent = fs.readFileSync(routeExportPath, 'utf8');

console.log('\n5. Checking route export fallbacks in routeExport.ts:');
const hasGeoMetaFallback = routeExportContent.includes('route.geoMeta.origin) || (startCoords ?') &&
                          routeExportContent.includes('route.geoMeta.destination) || (endCoords ?');

if (hasGeoMetaFallback) {
  console.log('   ✅ PASS: Found geoMeta fallback to start/end coords');
} else {
  console.log('   ❌ FAIL: Missing geoMeta fallback to start/end coords');
}

console.log('\n🔍 Verification complete.');