'use strict';
/**
 * test_bg_calc.js — Background calculation smoke test
 * Usage: node scripts/test_bg_calc.js [divisionId] [date]
 */
process.env.NODE_ENV = 'test';

const DIVISION_ID = process.argv[2] || '100000064';
const TARGET_DATE  = process.argv[3] || '2026-04-17';

async function main() {
    const models = require('../src/models');
    const { sequelize, DashboardCache, Route, GeoCache } = models;
    const { Op } = require('sequelize');

    // ── 1. Load cache ─────────────────────────────────────────────────────────
    const cache = await DashboardCache.findOne({
        where: { division_id: DIVISION_ID, target_date: TARGET_DATE }
    });
    if (!cache) {
        console.error(`[TEST] ❌ No cache found for div=${DIVISION_ID} date=${TARGET_DATE}`);
        process.exit(1);
    }

    const orders = cache.payload?.orders || [];
    console.log(`\n✅ Cache loaded: div=${DIVISION_ID} date=${TARGET_DATE} orders=${orders.length}`);

    // ── 2. Field diagnostic ───────────────────────────────────────────────────
    if (orders.length > 0) {
        const s = orders[0];
        const geo = s.addressGeo || s.AddressGeo || '';
        const m = geo.match(/CityName\s*=\s*"([^"]+)"/);
        console.log(`📋 city="${s.city||s.CityName||s.cityName||'undefined'}" addressGeo city="${m?.[1]||'(none)'}" GPS="${!!s.coords?.lat}"`);
    }

    // ── 3. Dynamic city from batch ────────────────────────────────────────────
    let dynamicCity = null;
    for (const o of orders) {
        dynamicCity = o.city || o.CityName || o.cityName || o.divisionName;
        if (!dynamicCity) {
            const geo = o.addressGeo || o.AddressGeo || '';
            const m = geo.match(/CityName\s*=\s*"([^"]+)"/);
            if (m) dynamicCity = m[1];
        }
        if (dynamicCity) break;
    }
    console.log(`🏙  Dynamic city from orders: "${dynamicCity || '(none)'}"`);

    // ── 4. Load singleton TurboCalculator ────────────────────────────────────
    const calc = require('../workers/turboCalculator');
    calc.io = { emit: () => {}, to: () => ({ emit: () => {} }) };

    // ── 5. KML preload ────────────────────────────────────────────────────────
    await calc.preloadKmlZones();
    const kmlCount = calc.kmlZones?.length || 0;
    console.log(`🗺  KML zones in DB: ${kmlCount}`);

    // ── 6. Presets ────────────────────────────────────────────────────────────
    const presets = await calc.getDivisionPresets(DIVISION_ID);
    if (presets) {
        console.log(`⚙️  Presets: cityBias="${presets.cityBias}" selectedZones=${(presets.selectedZones||[]).length} startLat=${presets.defaultStartLat||'none'}`);
    } else {
        console.log(`⚙️  Presets: (none for div ${DIVISION_ID})`);
    }

    // ── 7. Active zone filter ─────────────────────────────────────────────────
    const selectedZones = presets?.selectedZones || [];
    const allZones = calc.kmlZones || [];
    let activeZones = allZones;
    if (selectedZones.length > 0 && allZones.length > 0) {
        activeZones = allZones.filter(z => {
            const key = `${(z.properties?.folderName||'').trim()}:${(z.properties?.name||'').trim()}`;
            return selectedZones.includes(key);
        });
        console.log(`🎯 Active zones filter: ${allZones.length} total → ${activeZones.length} active`);
    } else if (selectedZones.length > 0 && allZones.length === 0) {
        console.log(`⚠️  User has ${selectedZones.length} selectedZones in presets but KML geometry not in DB yet`);
        console.log(`   → Geocoding will use city bounds only (no polygon restriction)`);
    }

    // ── 8. Routes BEFORE ─────────────────────────────────────────────────────
    const [beforeRows] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM calculated_routes WHERE division_id = :divId AND route_data->>'target_date' = :date`,
        { replacements: { divId: DIVISION_ID, date: TARGET_DATE } }
    );
    const beforeCount = parseInt(beforeRows[0]?.cnt || 0);
    console.log(`\n📊 Routes BEFORE: ${beforeCount}`);

    // ── 9. Run processCache ───────────────────────────────────────────────────
    console.log('\n🚀 Running processCache...');
    const t0 = Date.now();
    try {
        await calc.processCache(cache);
    } catch (err) {
        console.error('\n❌ processCache ERROR:', err.message);
        console.error(err.stack?.split('\n').slice(0, 8).join('\n'));
        await sequelize.close();
        process.exit(1);
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // ── 10. Routes AFTER ─────────────────────────────────────────────────────
    const [afterRows] = await sequelize.query(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN route_data->>'status' = 'rejected' THEN 1 ELSE 0 END) as rejected,
            SUM(CASE WHEN (total_distance::float > 200000) THEN 1 ELSE 0 END) as ghosts,
            AVG(CASE WHEN route_data->>'status' != 'rejected' THEN total_distance::float ELSE NULL END) as avg_dist
         FROM calculated_routes 
         WHERE division_id = :divId AND route_data->>'target_date' = :date`,
        { replacements: { divId: DIVISION_ID, date: TARGET_DATE } }
    );
    const stats = afterRows[0] || {};
    const totalRoutes  = parseInt(stats.total || 0);
    const rejectedCnt  = parseInt(stats.rejected || 0);
    const ghostsCnt    = parseInt(stats.ghosts || 0);
    const avgKm        = stats.avg_dist ? (parseFloat(stats.avg_dist) / 1000).toFixed(1) : '0';
    const validCnt     = totalRoutes - rejectedCnt;

    console.log('\n════════════════════════════════════════════');
    console.log('        BACKGROUND CALC RESULT              ');
    console.log('════════════════════════════════════════════');
    console.log(`⏱  Time:           ${elapsed}s`);
    console.log(`📦 Orders:         ${orders.length}`);
    console.log(`🛣  Routes total:   ${totalRoutes} (was ${beforeCount})`);
    console.log(`✅ Valid routes:   ${validCnt}`);
    console.log(`❌ Rejected:       ${rejectedCnt}`);
    console.log(`👻 Ghost (>200km): ${ghostsCnt}`);
    console.log(`📏 Avg valid dist: ${avgKm} km`);
    console.log('════════════════════════════════════════════');

    // ── 11. Detail on ghosts/rejected ────────────────────────────────────────
    if (rejectedCnt > 0 || ghostsCnt > 0) {
        const [badRoutes] = await sequelize.query(
            `SELECT courier_id, total_distance, orders_count, route_data->>'status' as status
             FROM calculated_routes 
             WHERE division_id = :divId AND route_data->>'target_date' = :date
             AND (route_data->>'status' = 'rejected' OR total_distance::float > 200000)
             LIMIT 10`,
            { replacements: { divId: DIVISION_ID, date: TARGET_DATE } }
        );
        if (badRoutes.length > 0) {
            console.log('\n⚠️  Problem routes:');
            badRoutes.forEach(r => console.log(`   ${r.courier_id}: ${(r.total_distance/1000).toFixed(1)}km | ${r.orders_count} orders | status=${r.status}`));
        }
        console.log('\n⚠️  TEST: Issues detected — check logs above');
    } else {
        console.log('\n✅ TEST PASS — No rejected routes, no ghost distances');
    }

    await sequelize.close();
    process.exit(0);
}

main().catch(e => {
    console.error('[TEST FATAL]', e.message);
    console.error(e.stack?.split('\n').slice(0,6).join('\n'));
    process.exit(1);
});
