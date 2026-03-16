const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../utils/logger');
const { KmlHub, KmlZone } = require('../models');

/**
 * KmlService
 * Handles fetching, parsing and querying KML data on the server.
 */
class KmlService {
    /**
     * Sync KML data from URL into the database.
     */
    async syncHubFromUrl(hubName, url) {
        try {
            logger.info(`Starting KML sync for hub: ${hubName}`, { url });

            // 1. Fetch KML
            const response = await axios.get(url);
            const kmlData = response.data;

            // 2. Parse KML
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_"
            });
            const jsonObj = parser.parse(kmlData);
            
            // Extract folders and placemarks (simplified for now)
            // Note: Real KML can be nested. This logic should be robust.
            const placemarks = this._extractPlacemarks(jsonObj);
            
            if (placemarks.length === 0) {
                throw new Error('No placemarks found in KML');
            }

            // 3. Upsert Hub
            const [hub] = await KmlHub.findOrCreate({
                where: { name: hubName },
                defaults: { source_url: url }
            });

            if (hub.source_url !== url) {
                await hub.update({ source_url: url });
            }

            // 4. Update Zones
            const zonesToCreate = [];
            for (const pm of placemarks) {
                if (pm.Polygon) {
                    const name = pm.name || 'Unnamed Zone';
                    const coordinates = this._parseCoordinates(pm.Polygon.outerBoundaryIs.LinearRing.coordinates);
                    const isTechnical = /auto.unload|technical/i.test(pm.name || '');
                    
                    zonesToCreate.push({
                        hub_id: hub.id,
                        name: name,
                        boundary: { type: 'Polygon', coordinates: [coordinates] },
                        bounds: this._calculateBounds(coordinates),
                        is_technical: isTechnical,
                        is_active: true
                    });
                }
            }

            // Replace all zones for this hub (Full Sync)
            await KmlZone.destroy({ where: { hub_id: hub.id } });
            await KmlZone.bulkCreate(zonesToCreate);

            await hub.update({ last_sync_at: new Date() });

            logger.info(`KML sync complete for ${hubName}. Created ${zonesToCreate.length} zones.`);
            return { success: true, count: zonesToCreate.length };

        } catch (error) {
            logger.error(`KML Sync Error [${hubName}]:`, { error: error.message });
            throw error;
        }
    }

    /**
     * Server-side Point-in-Polygon check.
     * Uses a spatial grid index for near O(1) lookups.
     */
    findZoneForLocation(lat, lng, zones) {
        // 1. Build index if not provided (cached per request or per sync)
        // For now, we take the provided zones and build a local temporary index
        // or just use bounds check if N is small.
        // Let's implement the index logic.
        
        const GRID_SIZE = 0.01; // Approx 1km cells
        const index = new Map();

        for (const zone of zones) {
            if (!zone.bounds) continue;
            
            const minX = Math.floor(zone.bounds.west / GRID_SIZE);
            const maxX = Math.ceil(zone.bounds.east / GRID_SIZE);
            const minY = Math.floor(zone.bounds.south / GRID_SIZE);
            const maxY = Math.ceil(zone.bounds.north / GRID_SIZE);

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) {
                    const key = `${x},${y}`;
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push(zone);
                }
            }
        }

        const cellX = Math.floor(lng / GRID_SIZE);
        const cellY = Math.floor(lat / GRID_SIZE);
        const candidates = index.get(`${cellX},${cellY}`) || [];

        for (const zone of candidates) {
            if (this._isPointInPolygon(lat, lng, zone.boundary.coordinates[0])) {
                return zone;
            }
        }
        return null;
    }

    _extractPlacemarks(obj) {
        let placemarks = [];
        const findPM = (node) => {
            if (!node) return;
            if (node.Placemark) {
                if (Array.isArray(node.Placemark)) placemarks.push(...node.Placemark);
                else placemarks.push(node.Placemark);
            }
            if (node.Folder) {
                if (Array.isArray(node.Folder)) node.Folder.forEach(findPM);
                else findPM(node.Folder);
            }
            if (node.Document) findPM(node.Document);
            if (node.kml) findPM(node.kml);
        };
        findPM(obj);
        return placemarks;
    }

    _parseCoordinates(coordStr) {
        if (!coordStr) return [];
        return coordStr.trim().split(/\s+/).map(pair => {
            const [lng, lat] = pair.split(',').map(Number);
            return [lng, lat];
        });
    }

    _calculateBounds(coords) {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        for (const [lng, lat] of coords) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        }
        return { north: maxLat, south: minLat, east: maxLng, west: minLng };
    }

    _isPointInPolygon(lat, lng, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][1], yi = polygon[i][0];
            const xj = polygon[j][1], yj = polygon[j][0];

            const intersect = ((yi > lng) !== (yj > lng))
                && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}

module.exports = new KmlService();
