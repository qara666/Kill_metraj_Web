const { KmlZone } = require('../src/models');
const logger = require('../src/utils/logger');

function calculateCentroid(coords) {
    if (!coords || coords.length === 0) return null;
    let sumLat = 0, sumLng = 0;
    let count = 0;
    for (const [lng, lat] of coords) {
        sumLat += lat;
        sumLng += lng;
        count++;
    }
    return { lat: sumLat / count, lng: sumLng / count };
}

async function run() {
    try {
        console.log('--- Starting Centroid Population ---');
        const zones = await KmlZone.findAll();
        console.log(`Found ${zones.length} zones to process.`);

        let updated = 0;
        for (const zone of zones) {
            if (zone.path && Array.isArray(zone.path)) {
                const centroid = calculateCentroid(zone.path);
                if (centroid) {
                    zone.centroid = centroid;
                    await zone.save();
                    updated++;
                }
            }
        }

        console.log(`Successfully updated ${updated} zones with centroids.`);
        console.log('--- Centroid Population Complete ---');
        process.exit(0);
    } catch (error) {
        console.error('Population failed:', error);
        process.exit(1);
    }
}

run();
