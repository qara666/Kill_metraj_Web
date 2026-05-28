const { sequelize, GeoCache, Route, KmlZone } = require('./backend/src/models');

async function run() {
    try {
        console.log('--- Database Diagnostics ---');
        
        const geoCount = await GeoCache.count();
        console.log(`GeoCache records: ${geoCount}`);
        
        const routeCount = await Route.count();
        console.log(`CalculatedRoutes records: ${routeCount}`);
        
        const kmlCount = await KmlZone.count();
        console.log(`KmlZone records: ${kmlCount}`);
        
        // Check if created_at exists in calculated_routes
        try {
            const [results] = await sequelize.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'calculated_routes' AND column_name = 'created_at'");
            console.log(`Column 'created_at' in calculated_routes: ${results.length > 0 ? 'EXISTS' : 'MISSING'}`);
        } catch (e) {
            console.log(`Error checking schema: ${e.message}`);
        }

        // Test a sample query that might be slow
        const start = Date.now();
        await Route.findAll({ limit: 10 });
        console.log(`Sample Route.findAll(limit 10) took: ${Date.now() - start}ms`);

    } catch (err) {
        console.error('Diagnostic error:', err);
    } finally {
        await sequelize.close();
    }
}

run();
