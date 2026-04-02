/**
 * Sandbox Test (v9 - FINAL): TurboCalculator End-to-End Verified
 * Full pipeline: Cache -> Coord Extraction -> Grouping -> OSRM -> DB -> Enrichment
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../src/config/database');
const calculator = require('../workers/turboCalculator');

async function runTest() {
    console.log('='.repeat(50));
    console.log('   🤖 TURBO ROBOT SANDBOX TEST v9');
    console.log('='.repeat(50));
    
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected.\n');

        // 1. Find the largest cache
        const [[topCache]] = await sequelize.query(`
            SELECT id, division_id, target_date, length(payload::text) as size
            FROM api_dashboard_cache 
            WHERE division_id = '100000052'
            ORDER BY length(payload::text) DESC 
            LIMIT 1
        `);
        
        if (!topCache) { console.error('❌ No caches found!'); process.exit(1); }
        
        const [[fullCache]] = await sequelize.query(`SELECT * FROM api_dashboard_cache WHERE id = ${topCache.id}`);
        const orders = fullCache.payload?.orders || [];
        const targetDate = fullCache.target_date;
        const divisionId = fullCache.division_id;
        
        console.log(`📦 Cache: ID=${topCache.id} | Division=${divisionId} | Date=${targetDate}`);
        console.log(`📦 Orders: ${orders.length} | Size: ${Math.round(topCache.size/1024)}KB`);
        
        const withCoords = orders.filter(o => o.addressGeo || o.coords?.lat || o.lat).length;
        console.log(`📋 Orders with coordinates/addressGeo: ${withCoords}/${orders.length}\n`);

        // 2. Mock socket.io
        let reportedRoutes = 0;
        calculator.io = {
            emit: (event, data) => {
                if (event === 'routes_update') {
                    reportedRoutes = data.routes?.length || 0;
                    console.log(`📡 [socket] routes_update -> ${reportedRoutes} routes emitted`);
                }
            }
        };

        // 3. Clear old routes
        const [[beforeClear]] = await sequelize.query(`SELECT COUNT(*) as cnt FROM calculated_routes WHERE route_data->>'target_date' = '${targetDate}'`);
        const clearedCount = parseInt(beforeClear.cnt);
        await sequelize.query(`DELETE FROM calculated_routes WHERE route_data->>'target_date' = '${targetDate}'`);
        console.log(`🗑️  Cleared ${clearedCount} existing routes for ${targetDate}\n`);

        // 4. Run
        console.log('🚀 Starting processCache...\n');
        const start = Date.now();
        
        await calculator.processCache({
            id: fullCache.id,
            division_id: divisionId,
            target_date: targetDate,
            payload: fullCache.payload,
            data_hash: 'sandbox-v9-force',
            update: async (updateData) => {
                await sequelize.query(
                    `UPDATE api_dashboard_cache SET payload = $1 WHERE id = $2`,
                    { bind: [JSON.stringify(updateData.payload), fullCache.id] }
                );
            }
        });
        
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`\n⏱️  Finished in ${elapsed}s\n`);

        // 5. Verify DB results
        const [[result]] = await sequelize.query(`
            SELECT 
                COUNT(*) as routes, 
                SUM(total_distance) as total_km,
                COUNT(DISTINCT courier_id) as couriers_with_routes
            FROM calculated_routes 
            WHERE route_data->>'target_date' = '${targetDate}'
        `);
        
        const [[cacheAfter]] = await sequelize.query(`SELECT payload FROM api_dashboard_cache WHERE id = ${topCache.id}`);
        const allCouriers = cacheAfter.payload?.couriers || [];
        const couriersWithKm = allCouriers.filter(c => c.distanceKm > 0);
        
        console.log('='.repeat(50));
        console.log('   📊 FINAL RESULTS');
        console.log('='.repeat(50));
        console.log(`  Date:                ${targetDate}`);
        console.log(`  Input orders:        ${orders.length}`);
        console.log(`  Routes in DB:        ${result.routes}`);
        console.log(`  Total distance:      ${parseFloat(result.total_km || 0).toFixed(2)} km`);
        console.log(`  Unique couriers:     ${result.couriers_with_routes}`);
        console.log(`  Couriers with km:    ${couriersWithKm.length} / ${allCouriers.length}`);
        console.log(`  Socket routes sent:  ${reportedRoutes}`);
        console.log('='.repeat(50));

        // 6. Detailed Grouping Audit (v5.152)
        console.log('\n📊 GROUPING AUDIT (15m / 15km rule):');
        const dbRoutes = await sequelize.query(`
            SELECT route_data->'courier' as courier, jsonb_array_length(route_data->'orders') as order_count, total_distance
            FROM calculated_routes 
            WHERE route_data->>'target_date' = :targetDate
        `, { replacements: { targetDate }, type: sequelize.QueryTypes.SELECT });
        
        const courierBlocks = {};
        dbRoutes.forEach(r => {
            const name = r.courier;
            if (!courierBlocks[name]) courierBlocks[name] = [];
            courierBlocks[name].push(r.order_count);
        });

        Object.entries(courierBlocks).slice(0, 10).forEach(([name, counts]) => {
            console.log(`   ${name.padEnd(25)} | Blocks: ${counts.length} | Orders: ${counts.join(', ')}`);
        });
        
        if (parseInt(result.routes) > 0 && couriersWithKm.length > 0) {
            console.log('🎉 SUCCESS: Full pipeline verified!');
            console.log('\nTop 5 couriers by distance:');
            couriersWithKm
                .sort((a, b) => b.distanceKm - a.distanceKm)
                .slice(0, 5)
                .forEach(c => {
                    const name = c.courierName || c.name;
                    console.log(`   ${name}: ${c.distanceKm} km`);
                });
        } else {
            console.warn('⚠️ PARTIAL FAILURE: Check logs above for errors.');
        }

    } catch (err) {
        console.error('❌ Fatal:', err.message);
        console.error(err.stack);
    }

    console.log('\n' + '='.repeat(50));
    process.exit(0);
}

runTest();
