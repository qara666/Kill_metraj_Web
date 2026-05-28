const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../utils/logger');
const { KmlHub, KmlZone } = require('../models');

/**
 * KmlService
 * Обрабатывает получение, парсинг и запросы KML данных на сервере.
 */
class KmlService {
    /**
     * Синхронизировать KML данные из URL в базу данных.
     */
    async syncHubFromUrl(hubName, url) {
        try {
            logger.info(`Starting KML sync for hub: ${hubName}`, { url });

            // 1. Загрузка KML
            const response = await axios.get(url);
            const kmlData = response.data;

            // 2. Парсинг KML
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_"
            });
            const jsonObj = parser.parse(kmlData);
            
            // Извлечение папок и меток (упрощено на данный момент)
            // Примечание: Реальный KML может быть вложенным. Эта логика должна быть надежной.
            const placemarks = this._extractPlacemarks(jsonObj);
            
            if (placemarks.length === 0) {
                throw new Error('No placemarks found in KML');
            }

            // 3. Upsert хаба
            const [hub] = await KmlHub.findOrCreate({
                where: { name: hubName },
                defaults: { source_url: url }
            });

            if (hub.source_url !== url) {
                await hub.update({ source_url: url });
            }

            // 4. Обновление зон
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
                        centroid: this._calculateCentroid(coordinates),
                        is_technical: isTechnical,
                        is_active: true
                    });
                }
            }

            // Замена всех зон для этого хаба (Полная синхронизация)
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
     * Серверная проверка Point-in-Polygon.
     * Использует пространственный сеточный индекс для почти O(1) поиска.
     */
    findZoneForLocation(lat, lng, zones) {
        // 1. Построение индекса, если не предоставлен (кэшируется на запрос или на синхронизацию)
        // Пока берем предоставленные зоны и строим локальный временный индекс
        // или просто используем проверку границ, если N мало.
        // Реализуем логику индекса.
        
        const GRID_SIZE = 0.01; // Приблизительно ячейки по 1км
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

    _calculateCentroid(coords) {
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

    _isPointInPolygon(lat, lng, polygon, tolerance = 0.01) {
        // v5.172: Добавлен допуск для граничных точек
        // v5.180: Увеличен стандартный допуск с 0.005 до 0.01 (~1.1км)
        
        // Сначала пробуем точную проверку
        if (this._pointInPolygonExact(lat, lng, polygon)) return true;
        
        // v5.180: Проверка расстояния до граней полигона (точнее, чем смещенные точки)
        if (tolerance > 0) {
            // Конвертация допуска из градусов в метры (~111км на градус)
            const toleranceMeters = tolerance * 111000;
            
            // Проверка расстояния до каждого ребра полигона
            for (let i = 0; i < polygon.length - 1; i++) {
                const dist = this._pointToSegmentDistance(lat, lng, polygon[i][1], polygon[i][0], polygon[i + 1][1], polygon[i + 1][0]);
                if (dist <= toleranceMeters) return true;
            }
        }
        
        return false;
    }

    // v5.180: Вычисление расстояния от точки до отрезка линии в метрах
    // ИСПРАВЛЕНИЕ: Используем отдельные метры-на-градус для lat и lng, чтобы избежать искажения проекции
    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        // px,py = точка lat,lng; x1,y1,x2,y2 = концы сегмента в формате lat,lng
        const avgLat = (px + x1 + x2) / 3;
        const metersPerDegLat = 111000;
        const metersPerDegLng = 111000 * Math.cos(avgLat * Math.PI / 180);
        
        const dx = (x2 - x1) * metersPerDegLng;
        const dy = (y2 - y1) * metersPerDegLat;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            const dLat = (px - x1) * metersPerDegLat;
            const dLng = (py - y1) * metersPerDegLng;
            return Math.sqrt(dLat * dLat + dLng * dLng);
        }

        const qx = (px - x1) * metersPerDegLng;
        const qy = (py - y1) * metersPerDegLat;

        let t = (qx * dx + qy * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);

        const dLat = (px - projX) * metersPerDegLat;
        const dLng = (py - projY) * metersPerDegLng;
        return Math.sqrt(dLat * dLat + dLng * dLng);
    }

    _pointInPolygonExact(lat, lng, polygon) {
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
