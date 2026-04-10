const fs = require('fs');
const path = require('path');

const filePath = '/Users/msun/Desktop/Project apps/Kill_metraj_Web/backend/workers/turboCalculator.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `                            const createdRoute = await Route.create({ // TEST MATCH
                                courier_id: normName,
                                division_id: cache.division_id,
                                total_distance: distanceKm,
                                total_duration: Math.round(routeResult.duration),
                                engine_used: routeResult.engine,
                                orders_count: uniqueRouteOrders.length,
                                calculated_at: new Date(),
                                route_data: {
                                    target_date: targetDateNorm, // v5.164: Save as YYYY-MM-DD
                                    division_id: cache.division_id,
                                    courier: normName,
                                    deliveryWindow: windowKey,
                                    timeBlocks: windowKey,
                                    windowStart: windowKey.split('-')[0],
                                    startAddress: presets?.defaultStartAddress || null,
                                    endAddress: presets?.defaultEndAddress || null,
                                    startCoords: globalStartPoint,
                                    endCoords: globalEndPoint || globalStartPoint, // Circular fallback
                                    isCircularRoute: !globalStartPoint && !globalEndPoint && uniqueRouteOrders.length > 0, 
                                    geoMeta: { 
                                        origin: globalStartPoint,
                                        destination: globalEndPoint || globalStartPoint,
                                        waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                    },
                                    orders: uniqueRouteOrders,
                                    geometry: routeResult.geometry
                                }
                            });

                            // v33: Push into memory cache immediately!
                            // v5.180: FRONTEND COMPATIBILITY — match frontend order structure EXACTLY
                            matchedExistingRouteIds.add(createdRoute.id);
                            inMemoryFrontendRoutes.push({
                                id: createdRoute.id,
                                courier: createdRoute.courier_id,
                                courier_id: createdRoute.courier_id,
                                totalDistance: parseFloat(createdRoute.total_distance || 0),
                                totalDuration: createdRoute.total_duration,
                                ordersCount: createdRoute.orders_count,
                                timeBlock: createdRoute.route_data?.deliveryWindow || createdRoute.route_data?.timeBlocks,
                                startAddress: createdRoute.route_data?.startAddress,
                                endAddress: createdRoute.route_data?.endAddress,
                                orders: (createdRoute.route_data?.orders || []).map(o => ({
                                    id: o.id,
                                    orderNumber: o.orderNumber,
                                    address: o.address || 'Адрес не указан',
                                    courier: normalizeCourierName(o.courier || createdRoute.courier_id),
                                    coords: o.coords || (o.lat && o.lng ? { lat: o.lat, lng: o.lng } : null),
                                    lat: o.lat || o.coords?.lat,
                                    lng: o.lng || o.coords?.lng,
                                    plannedTime: o.plannedTime || o.deliveryTime || o.deliverBy,
                                    status: o.status,
                                    statusTimings: o.statusTimings,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    deliveryZone: o.deliveryZone,
                                    locationType: o.locationType,
                                    streetNumberMatched: o.streetNumberMatched,
                                    manualGroupId: o.manualGroupId,
                                    handoverAt: o.handoverAt,
                                    executionTime: o.executionTime,
                                })),
                                isCalculated: true // v5.175: Force UI to treat this as solid data
                            });`;

const replacement = `                            // v38.0: Use raw SQL with ON CONFLICT for reliable upsert
                            const routeDataObj = {
                                target_date: targetDateNorm,
                                division_id: cache.division_id,
                                courier: normName,
                                deliveryWindow: windowKey,
                                timeBlocks: windowKey,
                                windowStart: windowKey.split('-')[0],
                                startAddress: presets?.defaultStartAddress || null,
                                endAddress: presets?.defaultEndAddress || null,
                                startCoords: globalStartPoint,
                                endCoords: globalEndPoint || globalStartPoint,
                                isCircularRoute: !globalStartPoint && !globalEndPoint && uniqueRouteOrders.length > 0, 
                                geoMeta: { 
                                    origin: globalStartPoint,
                                    destination: globalEndPoint || globalStartPoint,
                                    waypoints: uniqueRouteOrders.map(o => o.coords).filter(Boolean)
                                },
                                orders: uniqueRouteOrders,
                                geometry: routeResult.geometry
                            };

                            const [upsertResult] = await sequelize.query(\`
                                INSERT INTO calculated_routes 
                                (courier_id, division_id, total_distance, total_duration, engine_used, orders_count, calculated_at, route_data, created_at, updated_at)
                                VALUES 
                                (:courier_id, :division_id, :total_distance, :total_duration, :engine_used, :orders_count, :calculated_at, :route_data, NOW(), NOW())
                                ON CONFLICT (division_id, courier_id, ((route_data->>'time_block')::text))
                                DO UPDATE SET
                                    total_distance = EXCLUDED.total_distance,
                                    total_duration = EXCLUDED.total_duration,
                                    engine_used = EXCLUDED.engine_used,
                                    orders_count = EXCLUDED.orders_count,
                                    calculated_at = EXCLUDED.calculated_at,
                                    route_data = EXCLUDED.route_data,
                                    updated_at = NOW()
                                RETURNING *
                            \`, {
                                replacements: {
                                    courier_id: normName,
                                    division_id: cache.division_id,
                                    total_distance: distanceKm,
                                    total_duration: Math.round(routeResult.duration),
                                    engine_used: routeResult.engine,
                                    orders_count: uniqueRouteOrders.length,
                                    calculated_at: new Date(),
                                    route_data: JSON.stringify(routeDataObj)
                                },
                                type: sequelize.QueryTypes.INSERT
                            });

                            const createdRoute = upsertResult[0];

                            // v33: Push into memory cache immediately!
                            matchedExistingRouteIds.add(createdRoute.id);
                            inMemoryFrontendRoutes.push({
                                id: createdRoute.id,
                                courier: createdRoute.courier_id,
                                courier_id: createdRoute.courier_id,
                                totalDistance: parseFloat(createdRoute.total_distance || 0),
                                totalDuration: createdRoute.total_duration,
                                ordersCount: createdRoute.orders_count,
                                timeBlock: createdRoute.route_data?.deliveryWindow || createdRoute.route_data?.timeBlocks,
                                startAddress: createdRoute.route_data?.startAddress,
                                endAddress: createdRoute.route_data?.endAddress,
                                orders: (createdRoute.route_data?.orders || []).map(o => ({
                                    id: o.id,
                                    orderNumber: o.orderNumber,
                                    address: o.address || 'Адрес не указан',
                                    courier: normalizeCourierName(o.courier || createdRoute.courier_id),
                                    coords: o.coords || (o.lat && o.lng ? { lat: o.lat, lng: o.lng } : null),
                                    lat: o.lat || o.coords?.lat,
                                    lng: o.lng || o.coords?.lng,
                                    plannedTime: o.plannedTime || o.deliveryTime || o.deliverBy,
                                    status: o.status,
                                    statusTimings: o.statusTimings,
                                    kmlZone: o.kmlZone || o.deliveryZone,
                                    kmlHub: o.kmlHub,
                                    deliveryZone: o.deliveryZone,
                                    locationType: o.locationType,
                                    streetNumberMatched: o.streetNumberMatched,
                                    manualGroupId: o.manualGroupId,
                                    handoverAt: o.handoverAt,
                                    executionTime: o.executionTime,
                                })),
                                isCalculated: true 
                            });`;

if (content.indexOf(target) === -1) {
    console.error('Target not found!');
    process.exit(1);
}

const newContent = content.replace(target, replacement);
fs.writeFileSync(filePath, newContent);
console.log('Successfully updated.');
